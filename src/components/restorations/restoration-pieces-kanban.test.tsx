import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { formatCents } from "@/domain/money";
import type { AppRole } from "@/lib/roles";
import type { PieceDetail } from "@/server/restorations/queries";
import {
  changePieceStatus,
  receiveFromWorkshop,
} from "@/server/restorations/status-actions";

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
  returnPiecesToClient: vi.fn(),
  assignWorkshop: vi.fn(),
  sendPiecesToWorkshop: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Las fechas de ida y vuelta del taller las trae la consulta (`StatusPiece`).
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
    arrivedAt: null,
    createdAt: "2026-10-01T15:00:00Z",
    deliveredAt: null,
    returnedAt: null,
    priceCents: null,
    ...patch,
  }) as PieceDetail;

const SENT = "2026-10-03T15:00:00Z";

const pieces = [
  piece(1, {
    status: "aprobada",
    urgent: true,
    serviceName: "Limpieza",
    priceCents: 12_000,
    arrivedAt: "2026-10-02T15:00:00Z",
    location: "sin_enviar",
  }),
  piece(2, {
    status: "aprobada",
    location: "en_taller",
    arrivedAt: "2026-10-02T15:00:00Z",
    firstSentAt: SENT,
    lastSentAt: SENT,
    workshopId: "w1",
    workshopName: "Taller Norte",
    priceCents: 5_000,
  }),
  piece(3, { status: "anulada", location: "anulada" }),
  piece(4),
];

const renderKanban = (role: AppRole) =>
  render(
    <RestorationPiecesKanban
      restorationId="r1"
      pieces={pieces}
      role={role}
      workshops={[{ id: "w1", name: "Taller Norte" }]}
    />,
  );

const bar = () =>
  screen.queryByRole("region", { name: "Acciones para las piezas elegidas" });

describe("RestorationPiecesKanban", () => {
  it("muestra los estados en curso y, de los finales, solo los que tienen piezas", () => {
    renderKanban("ventas");
    const list = screen.getByRole("list", { name: "Piezas por estado" });
    const columns = within(list)
      .getAllByRole("listitem")
      .map((c) => c.getAttribute("aria-label"));
    expect(columns).toEqual([
      "Registrada",
      "Consulta",
      "Espera respuesta cliente",
      "Aprobada",
      "En restauración",
      "Lista para entregar",
      "Observación",
      "Anulado",
    ]);
    expect(screen.getByTestId("columna-en_consulta")).toHaveTextContent(
      "Sin piezas",
    );
    expect(screen.queryByTestId("columna-entregada")).toBeNull();
  });

  it("pone cada pieza en su columna con sus datos y su enlace", () => {
    renderKanban("ventas");
    const card = within(screen.getByTestId("columna-aprobada")).getByTestId(
      "tarjeta-RES-00012-1",
    );
    expect(
      within(card).getByRole("link", { name: "RES-00012-1" }),
    ).toHaveAttribute("href", "/piezas/p1");
    expect(card).toHaveTextContent("Pieza 1");
    expect(card).toHaveTextContent("Servicio: Limpieza");
    expect(card).toHaveTextContent("Urgente");
    expect(card).toHaveTextContent("Sin enviar");
    expect(card).toHaveTextContent("Sin taller");
    // Acento de pieza, como en la lista: es hija de la guía.
    expect(card).toHaveClass("border-l-4");

    // "En restauración" no es un estado: Aprobada que está en el taller.
    const sent = within(
      screen.getByTestId("columna-en_restauracion"),
    ).getByTestId("tarjeta-RES-00012-2");
    expect(sent).toHaveTextContent("Taller Norte");
    expect(sent).not.toHaveTextContent("Urgente");
    expect(screen.getByTestId("columna-anulada")).toContainElement(
      screen.getByTestId("tarjeta-RES-00012-3"),
    );
  });

  it("muestra el precio a quien ve montos, o «Por definir» si aún no tiene", () => {
    renderKanban("ventas");
    expect(
      within(screen.getByTestId("tarjeta-RES-00012-1")).getByTestId("precio"),
    ).toHaveTextContent(`Precio: ${formatCents(12_000)}`);
    expect(
      within(screen.getByTestId("tarjeta-RES-00012-4")).getByTestId("precio"),
    ).toHaveTextContent("Por definir");
  });

  it("una guía observada no muestra precios", () => {
    render(
      <RestorationPiecesKanban
        restorationId="r1"
        pieces={pieces}
        role="ventas"
        workshops={[]}
        guideKind="observado"
      />,
    );
    expect(screen.queryAllByTestId("precio")).toHaveLength(0);
  });

  it("no muestra precios a logística", () => {
    renderKanban("logistica");
    expect(screen.queryAllByTestId("precio")).toHaveLength(0);
    expect(screen.queryByText("Por definir")).toBeNull();
  });

  it("al elegir piezas aparece la barra de acciones masivas", async () => {
    const user = userEvent.setup();
    renderKanban("ventas");
    expect(bar()).toBeNull();
    await user.click(screen.getByLabelText("Elegir RES-00012-4"));
    expect(bar()).toHaveTextContent("1 pieza seleccionada");
    await user.click(
      within(bar()!).getByRole("button", { name: "Quitar selección" }),
    );
    expect(bar()).toBeNull();
    expect(screen.getByLabelText("Elegir RES-00012-4")).not.toBeChecked();
  });
});

describe("RestorationPiecesKanban: mover de estado", () => {
  beforeEach(() => {
    vi.mocked(changePieceStatus).mockReset().mockResolvedValue({ ok: true });
  });

  const openMenu = async (
    user: ReturnType<typeof userEvent.setup>,
    code: string,
  ) => {
    await user.click(screen.getByRole("button", { name: `Mover ${code} a…` }));
    return screen.getByRole("menu");
  };

  it("cada tarjeta se arrastra desde su asa o se mueve con «Mover a…»", () => {
    renderKanban("ventas");
    const card = screen.getByTestId("tarjeta-RES-00012-4");
    expect(
      within(card).getByRole("button", { name: "Arrastrar RES-00012-4" }),
    ).toHaveAttribute("aria-roledescription", "tarjeta arrastrable");
    expect(
      within(card).getByRole("button", { name: "Mover RES-00012-4 a…" }),
    ).toBeVisible();
    // Una pieza anulada ya no cambia de estado: sin menú.
    expect(
      screen.queryByRole("button", { name: "Mover RES-00012-3 a…" }),
    ).toBeNull();
  });

  it("«Mover a…» lista solo los estados permitidos y cambia el estado", async () => {
    const user = userEvent.setup();
    renderKanban("ventas");
    const menu = await openMenu(user, "RES-00012-4");
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent),
    ).toEqual(["Consulta", "Aprobada", "Anulado"]);

    await user.click(within(menu).getByRole("menuitem", { name: "Aprobada" }));
    expect(changePieceStatus).toHaveBeenCalledWith(
      "r1",
      ["p4"],
      "aprobada",
      null,
      null,
    );
    expect(toast.success).toHaveBeenCalledWith("RES-00012-4: Aprobada.");
  });

  it("si el cambio pide nota, abre el diálogo de cambio de estado", async () => {
    const user = userEvent.setup();
    renderKanban("ventas");
    const menu = await openMenu(user, "RES-00012-4");
    await user.click(within(menu).getByRole("menuitem", { name: "Consulta" }));

    const dialog = await screen.findByRole("dialog", {
      name: "Poner en consulta: RES-00012-4",
    });
    expect(changePieceStatus).not.toHaveBeenCalled();
    await user.type(
      within(dialog).getByLabelText("Nota (obligatoria)"),
      "¿Se puede soldar?",
    );
    await user.click(
      within(dialog).getByRole("button", {
        name: "Confirmar: Poner en consulta",
      }),
    );
    expect(changePieceStatus).toHaveBeenCalledWith(
      "r1",
      ["p4"],
      "en_consulta",
      "¿Se puede soldar?",
      null,
    );
  });

  it("logística envía al taller desde el menú (acción de ubicación, con taller)", async () => {
    const user = userEvent.setup();
    renderKanban("logistica");
    expect(
      screen.queryByRole("button", { name: "Mover RES-00012-4 a…" }),
    ).toBeNull();
    const menu = await openMenu(user, "RES-00012-1");
    // Ya no es un estado al que mover: va en «Ubicación».
    expect(
      within(menu).queryByRole("menuitem", { name: "En restauración" }),
    ).toBeNull();
    await user.click(
      within(menu).getByRole("menuitem", { name: "Enviar al taller" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Enviar al taller: RES-00012-1",
    });
    expect(within(dialog).getByLabelText("Taller")).toBeVisible();
  });

  it("la pieza en el taller se recibe desde «Recibir del taller»", async () => {
    vi.mocked(receiveFromWorkshop).mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    renderKanban("logistica");
    const menu = await openMenu(user, "RES-00012-2");
    await user.click(
      within(menu).getByRole("menuitem", { name: "Recibir del taller" }),
    );
    expect(receiveFromWorkshop).toHaveBeenCalledWith("r1", ["p2"]);
  });

  it("aprobar la última pieza ofrece registrar el adelanto, como en la lista", async () => {
    const user = userEvent.setup();
    render(
      <RestorationPiecesKanban
        restorationId="r1"
        pieces={pieces}
        role="ventas"
        workshops={[]}
        approvalPayment={{
          methods: [{ id: "m1", name: "Efectivo" }],
          suggested: { kind: "adelanto", amount: 6_000 },
        }}
      />,
    );
    const menu = await openMenu(user, "RES-00012-4");
    await user.click(within(menu).getByRole("menuitem", { name: "Aprobada" }));
    expect(
      await screen.findByRole("dialog", { name: "Aprobar RES-00012-4" }),
    ).toBeVisible();
    expect(changePieceStatus).not.toHaveBeenCalled();
  });
});
