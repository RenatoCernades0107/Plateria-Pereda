import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppRole } from "@/lib/roles";
import type { PieceDetail } from "@/server/restorations/queries";
import {
  changePieceStatus,
  receiveFromWorkshop,
  undoPieceMove,
} from "@/server/restorations/status-actions";

import { UNDO_TOAST_MS } from "./piece-moves";
import type { StatusPiece } from "./piece-status-actions";
import { RestorationPiecesKanban } from "./restoration-pieces-kanban";

vi.mock("@/server/payments/actions", () => ({
  approveWithPayment: vi.fn(),
  deliverWithBalance: vi.fn(),
}));
vi.mock("@/server/restorations/status-actions", () => ({
  changePieceStatus: vi.fn(),
  markPiecesArrived: vi.fn(),
  receiveFromWorkshop: vi.fn(),
  receivePiecesFromReview: vi.fn(),
  returnPiecesToClient: vi.fn(),
  assignWorkshop: vi.fn(),
  sendPiecesForReview: vi.fn(),
  sendPiecesToWorkshop: vi.fn(),
  undoPieceMove: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const piece = (
  n: number,
  patch: Partial<PieceDetail & StatusPiece> = {},
): PieceDetail =>
  ({
    id: `p${n}`,
    number: n,
    code: `RES-00012-${n}`,
    status: "registrada",
    location: "sin_enviar",
    urgent: false,
    readyForDelivery: false,
    description: `Pieza ${n}`,
    measure: "",
    materialName: "",
    serviceName: "",
    weightGrams: null,
    workshopId: null,
    workshopName: null,
    materialIds: [],
    serviceIds: [],
    notes: "",
    arrivedAt: "2026-10-02T15:00:00Z",
    createdAt: "2026-10-01T15:00:00Z",
    deliveredAt: null,
    returnedAt: null,
    priceCents: null,
    ...patch,
  }) as PieceDetail;

const SENT = "2026-10-03T15:00:00Z";
const registered = piece(4);
const inWorkshop = piece(2, {
  status: "aprobada",
  location: "en_taller",
  firstSentAt: SENT,
  lastSentAt: SENT,
  workshopId: "w1",
  workshopName: "Taller Norte",
});

const kanban = (pieces: PieceDetail[], role: AppRole = "admin") => (
  <RestorationPiecesKanban
    restorationId="r1"
    pieces={pieces}
    role={role}
    workshops={[{ id: "w1", name: "Taller Norte" }]}
  />
);

const openMenu = async (
  user: ReturnType<typeof userEvent.setup>,
  code: string,
) => {
  await user.click(screen.getByRole("button", { name: `Mover ${code} a…` }));
  return screen.getByRole("menu");
};

type ToastOptions = {
  duration: number;
  action: { label: string; onClick: () => void };
};

/** Opciones del último aviso de éxito (el de "Deshacer"). */
const lastSuccessOptions = () =>
  vi.mocked(toast.success).mock.calls.at(-1)?.[1] as ToastOptions | undefined;

const column = (key: string) => screen.getByTestId(`columna-${key}`);

describe("usePieceMoves: «Deshacer» en el aviso", () => {
  beforeEach(() => {
    vi.mocked(toast.success).mockReset();
    vi.mocked(toast.error).mockReset();
    vi.mocked(changePieceStatus).mockReset();
    vi.mocked(receiveFromWorkshop).mockReset();
    vi.mocked(undoPieceMove).mockReset();
  });

  it("tras mover, el aviso ofrece «Deshacer» 8 s y deshace ese movimiento", async () => {
    vi.mocked(changePieceStatus).mockResolvedValue({
      ok: true,
      undoIds: [11],
    });
    vi.mocked(undoPieceMove).mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(kanban([registered]));

    const menu = await openMenu(user, "RES-00012-4");
    await user.click(within(menu).getByRole("menuitem", { name: "Aprobada" }));

    expect(toast.success).toHaveBeenCalledWith("RES-00012-4: Aprobada.", {
      duration: UNDO_TOAST_MS,
      action: { label: "Deshacer", onClick: expect.any(Function) },
    });
    expect(UNDO_TOAST_MS).toBe(8000);

    await act(async () => lastSuccessOptions()!.action.onClick());
    expect(undoPieceMove).toHaveBeenCalledWith("r1", [11]);
    expect(toast.success).toHaveBeenLastCalledWith("Movimiento deshecho");
  });

  it("sin eventos para deshacer (p. ej. se encoló la orden de Shopify) el aviso es el de siempre", async () => {
    vi.mocked(changePieceStatus).mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(kanban([registered]));

    const menu = await openMenu(user, "RES-00012-4");
    await user.click(within(menu).getByRole("menuitem", { name: "Aprobada" }));

    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith("RES-00012-4: Aprobada.");
  });

  it("los cambios con nota (diálogo) también se deshacen", async () => {
    vi.mocked(changePieceStatus).mockResolvedValue({
      ok: true,
      undoIds: [12],
    });
    vi.mocked(undoPieceMove).mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(kanban([registered]));

    const menu = await openMenu(user, "RES-00012-4");
    await user.click(within(menu).getByRole("menuitem", { name: "Consulta" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Poner en consulta: RES-00012-4",
    });
    await user.type(
      within(dialog).getByLabelText("Nota (obligatoria)"),
      "¿Se puede soldar?",
    );
    await user.click(
      within(dialog).getByRole("button", {
        name: "Confirmar: Poner en consulta",
      }),
    );

    expect(lastSuccessOptions()?.action.label).toBe("Deshacer");
    await act(async () => lastSuccessOptions()!.action.onClick());
    expect(undoPieceMove).toHaveBeenCalledWith("r1", [12]);
  });

  it("«Recibir del taller» se deshace con su propio evento (no con otro envío)", async () => {
    vi.mocked(receiveFromWorkshop).mockResolvedValue({
      ok: true,
      undoIds: [21],
    });
    vi.mocked(undoPieceMove).mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(kanban([inWorkshop], "logistica"));

    const menu = await openMenu(user, "RES-00012-2");
    await user.click(
      within(menu).getByRole("menuitem", { name: "Recibir del taller" }),
    );
    expect(toast.success).toHaveBeenCalledWith(
      "RES-00012-2: volvió del taller.",
      expect.objectContaining({ duration: UNDO_TOAST_MS }),
    );

    await act(async () => lastSuccessOptions()!.action.onClick());
    expect(undoPieceMove).toHaveBeenCalledWith("r1", [21]);
  });

  it("si la BD no deja deshacer, avisa con su mensaje", async () => {
    vi.mocked(changePieceStatus).mockResolvedValue({
      ok: true,
      undoIds: [11],
    });
    vi.mocked(undoPieceMove).mockResolvedValue({
      error:
        "Ya pasó el tiempo para deshacer el movimiento de la pieza RES-00012-4.",
    });
    const user = userEvent.setup();
    render(kanban([registered]));

    const menu = await openMenu(user, "RES-00012-4");
    await user.click(within(menu).getByRole("menuitem", { name: "Aprobada" }));
    await act(async () => lastSuccessOptions()!.action.onClick());

    expect(toast.error).toHaveBeenCalledWith(
      "RES-00012-4: Ya pasó el tiempo para deshacer el movimiento de la pieza RES-00012-4.",
    );
    expect(toast.success).not.toHaveBeenCalledWith("Movimiento deshecho");
  });

  it("mientras se deshace, la pieza se ve otra vez donde estaba", async () => {
    vi.mocked(changePieceStatus).mockResolvedValue({
      ok: true,
      undoIds: [11],
    });
    let finish: (value: { ok: true }) => void = () => {};
    vi.mocked(undoPieceMove).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const user = userEvent.setup();
    const { rerender } = render(kanban([registered]));

    const menu = await openMenu(user, "RES-00012-4");
    await user.click(within(menu).getByRole("menuitem", { name: "Aprobada" }));
    // La página se refresca con la pieza ya aprobada.
    rerender(kanban([piece(4, { status: "aprobada" })]));
    expect(
      within(column("aprobada")).getByTestId("tarjeta-RES-00012-4"),
    ).toBeVisible();

    await act(async () => {
      lastSuccessOptions()!.action.onClick();
    });
    expect(
      within(column("registrada")).getByTestId("tarjeta-RES-00012-4"),
    ).toBeVisible();
    expect(
      within(column("aprobada")).queryByTestId("tarjeta-RES-00012-4"),
    ).toBeNull();

    await act(async () => finish({ ok: true }));
    expect(toast.success).toHaveBeenLastCalledWith("Movimiento deshecho");
  });
});
