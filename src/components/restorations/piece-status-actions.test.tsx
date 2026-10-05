import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PieceStatus } from "@/domain/piece-state-machine";
import type { AppRole } from "@/lib/roles";

import { PieceStatusPanel } from "./piece-status-actions";
import { commonTransitions } from "./pieces-board";

const mocks = vi.hoisted(() => ({
  change: vi.fn(),
  arrive: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/server/restorations/status-actions", () => ({
  changePieceStatus: (...a: unknown[]) => mocks.change(...a),
  markPiecesArrived: (...a: unknown[]) => mocks.arrive(...a),
  assignWorkshop: vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: { success: mocks.success, error: mocks.error },
}));

const workshops = [
  { id: "00000000-0000-0000-0000-0000000000f1", name: "Taller Central" },
];

function renderPanel(
  status: PieceStatus,
  role: AppRole,
  extra: { arrivedAt?: string | null; workshopId?: string | null } = {},
) {
  return render(
    <PieceStatusPanel
      restorationId="r1"
      piece={{
        id: "p1",
        code: "RES-00001-1",
        status,
        arrivedAt: extra.arrivedAt ?? null,
        workshopId: extra.workshopId ?? null,
      }}
      role={role}
      workshops={workshops}
    />,
  );
}

const buttons = () =>
  within(screen.getByRole("group", { name: "Acciones de RES-00001-1" }))
    .getAllByRole("button")
    .map((b) => b.textContent);

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset();
  mocks.change.mockResolvedValue({ ok: true });
  mocks.arrive.mockResolvedValue({ ok: true });
});

describe("PieceStatusPanel", () => {
  it("muestra solo las acciones del rol para el estado", () => {
    renderPanel("registrada", "ventas");
    expect(buttons()).toEqual([
      "Marcar llegada a tienda",
      "Poner en consulta",
      "Aprobar",
      "Anular",
    ]);
  });

  it("logística no consulta, aprueba ni anula", () => {
    renderPanel("registrada", "logistica");
    expect(buttons()).toEqual(["Marcar llegada a tienda"]);
  });

  it("solo el admin anula una pieza que está en el taller", () => {
    const { unmount } = renderPanel("enviada_taller", "ventas");
    expect(screen.queryByRole("group")).toBeNull();
    unmount();
    renderPanel("enviada_taller", "admin");
    expect(buttons()).toEqual(["Recibir del taller", "Anular"]);
  });

  it("sin acciones (anulada) solo muestra el estado y la ubicación", () => {
    renderPanel("anulada", "admin");
    expect(screen.queryByRole("group")).toBeNull();
    expect(screen.getAllByText("Anulada")).toHaveLength(2);
  });

  it("aprueba al instante y muestra el estado de forma optimista", async () => {
    const user = userEvent.setup();
    renderPanel("registrada", "ventas", { arrivedAt: "2026-10-04T10:00:00Z" });
    await user.click(screen.getByRole("button", { name: "Aprobar" }));
    expect(mocks.change).toHaveBeenCalledWith(
      "r1",
      ["p1"],
      "aprobada",
      null,
      null,
    );
    expect(mocks.success).toHaveBeenCalledWith("RES-00001-1: Aprobada.");
  });

  it("si la BD rechaza el cambio avisa el error", async () => {
    mocks.change.mockResolvedValue({
      error: "Tu rol no puede hacer este cambio de estado.",
    });
    const user = userEvent.setup();
    renderPanel("registrada", "ventas");
    await user.click(screen.getByRole("button", { name: "Aprobar" }));
    expect(mocks.error).toHaveBeenCalledWith(
      "Tu rol no puede hacer este cambio de estado.",
    );
    expect(screen.getByText("Registrada")).toBeInTheDocument();
  });

  it("el diálogo exige la nota al anular", async () => {
    const user = userEvent.setup();
    renderPanel("aprobada", "ventas");
    await user.click(screen.getByRole("button", { name: "Anular" }));
    const dialog = screen.getByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Confirmar: Anular" }),
    );
    expect(
      within(dialog).getByText("Escribe una nota para este cambio de estado."),
    ).toBeVisible();
    expect(mocks.change).not.toHaveBeenCalled();
    await user.type(
      within(dialog).getByLabelText("Nota (obligatoria)"),
      "Desistió",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Confirmar: Anular" }),
    );
    expect(mocks.change).toHaveBeenCalledWith(
      "r1",
      ["p1"],
      "anulada",
      "Desistió",
      null,
    );
  });

  it("el diálogo exige el taller al enviar y propone el ya asignado", async () => {
    const user = userEvent.setup();
    const { unmount } = renderPanel("recibida", "logistica");
    await user.click(screen.getByRole("button", { name: "Enviar al taller" }));
    let dialog = screen.getByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", {
        name: "Confirmar: Enviar al taller",
      }),
    );
    expect(
      within(dialog).getByText("Elige el taller al que se envía la pieza."),
    ).toBeVisible();
    unmount();

    renderPanel("recibida", "logistica", { workshopId: workshops[0]!.id });
    await user.click(screen.getByRole("button", { name: "Enviar al taller" }));
    dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText("Taller")).toHaveTextContent(
      "Taller Central",
    );
    await user.click(
      within(dialog).getByRole("button", {
        name: "Confirmar: Enviar al taller",
      }),
    );
    expect(mocks.change).toHaveBeenCalledWith(
      "r1",
      ["p1"],
      "enviada_taller",
      null,
      workshops[0]!.id,
    );
  });

  it("marca la llegada a tienda", async () => {
    const user = userEvent.setup();
    renderPanel("aprobada", "logistica");
    await user.click(
      screen.getByRole("button", { name: "Marcar llegada a tienda" }),
    );
    expect(mocks.arrive).toHaveBeenCalledWith("r1", ["p1"]);
  });
});

describe("commonTransitions", () => {
  it("ofrece solo los cambios posibles para todas las piezas elegidas", () => {
    expect(
      commonTransitions(
        [{ status: "recibida" }, { status: "observada" }],
        "logistica",
      ).map((c) => c.to),
    ).toEqual(["enviada_taller"]);
    const anular = commonTransitions(
      [{ status: "registrada" }, { status: "aprobada" }],
      "ventas",
    );
    // Registrada puede consultar, aprobar o anular; Aprobada solo anular.
    expect(anular.map((c) => c.to)).toEqual(["anulada"]);
    expect(anular.find((c) => c.to === "anulada")?.requiresNote).toBe(true);
    expect(commonTransitions([], "admin")).toEqual([]);
  });
});
