import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PieceStatus } from "@/domain/piece-state-machine";
import { deriveLocation } from "@/domain/restoration-status";
import type { AppRole } from "@/lib/roles";

import { PieceStatusPanel } from "./piece-status-actions";
import { commonTransitions } from "./pieces-board";

const mocks = vi.hoisted(() => ({
  change: vi.fn(),
  arrive: vi.fn(),
  receive: vi.fn(),
  giveBack: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/server/restorations/status-actions", () => ({
  changePieceStatus: (...a: unknown[]) => mocks.change(...a),
  markPiecesArrived: (...a: unknown[]) => mocks.arrive(...a),
  receiveFromWorkshop: (...a: unknown[]) => mocks.receive(...a),
  returnPiecesToClient: (...a: unknown[]) => mocks.giveBack(...a),
  assignWorkshop: vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: { success: mocks.success, error: mocks.error },
}));

const workshops = [
  { id: "00000000-0000-0000-0000-0000000000f1", name: "Taller Central" },
];

const ARRIVED = "2026-10-04T10:00:00Z";

function renderPanel(
  status: PieceStatus,
  role: AppRole,
  extra: {
    arrivedAt?: string | null;
    workshopId?: string | null;
    readyForDelivery?: boolean;
    urgent?: boolean;
  } = {},
) {
  const arrivedAt = extra.arrivedAt ?? null;
  const readyForDelivery = extra.readyForDelivery ?? false;
  return render(
    <PieceStatusPanel
      restorationId="r1"
      piece={{
        id: "p1",
        code: "RES-00001-1",
        status,
        location: deriveLocation({
          status,
          arrivedAt: arrivedAt ? new Date(arrivedAt) : null,
          firstSentAt:
            status === "enviada_taller"
              ? new Date("2026-10-05T10:00:00Z")
              : null,
          lastSentAt: new Date("2026-10-05T10:00:00Z"),
          lastReturnedAt: readyForDelivery
            ? new Date("2026-10-06T10:00:00Z")
            : null,
        }),
        arrivedAt,
        workshopId: extra.workshopId ?? null,
        readyForDelivery,
        returnedAt: null,
        urgent: extra.urgent ?? false,
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
  mocks.receive.mockResolvedValue({ ok: true });
  mocks.giveBack.mockResolvedValue({ ok: true });
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

  it("Rechazar solo aparece en Espera respuesta cliente (P50)", () => {
    renderPanel("en_espera", "ventas");
    expect(buttons()).toContain("Rechazar");
    expect(buttons()).toContain("Aprobar");
  });

  it("logística no consulta, aprueba ni anula", () => {
    renderPanel("registrada", "logistica");
    expect(buttons()).toEqual(["Marcar llegada a tienda"]);
  });

  it("solo el admin anula una pieza que está en el taller", () => {
    const { unmount } = renderPanel("enviada_taller", "ventas", {
      arrivedAt: ARRIVED,
    });
    expect(buttons()).toEqual(["No tiene arreglo"]);
    unmount();
    renderPanel("enviada_taller", "admin", { arrivedAt: ARRIVED });
    expect(buttons()).toEqual([
      "Recibir del taller",
      "No tiene arreglo",
      "Anular",
    ]);
    expect(screen.getByText("En taller")).toBeInTheDocument();
  });

  it("recibe la pieza del taller: sigue en Interno, lista para entregar", async () => {
    const user = userEvent.setup();
    renderPanel("enviada_taller", "logistica", { arrivedAt: ARRIVED });
    await user.click(
      screen.getByRole("button", { name: "Recibir del taller" }),
    );
    expect(mocks.receive).toHaveBeenCalledWith("r1", ["p1"]);
    expect(mocks.change).not.toHaveBeenCalled();
    expect(mocks.success).toHaveBeenCalledWith(
      "RES-00001-1: volvió del taller.",
    );
  });

  it("de vuelta del taller se entrega u observa", () => {
    renderPanel("enviada_taller", "logistica", {
      arrivedAt: ARRIVED,
      readyForDelivery: true,
    });
    expect(buttons()).toEqual(["No tiene arreglo", "Entregar", "Observar"]);
    // "En tienda" = volvió del taller (P48).
    expect(screen.getByText("En tienda")).toBeInTheDocument();
    expect(screen.getByText("Interno")).toBeInTheDocument();
  });

  it("devuelve al cliente una pieza rechazada que está en la tienda", async () => {
    const user = userEvent.setup();
    renderPanel("rechazada", "logistica", { arrivedAt: ARRIVED });
    expect(buttons()).toEqual(["Devolver al cliente"]);
    await user.click(
      screen.getByRole("button", { name: "Devolver al cliente" }),
    );
    expect(mocks.giveBack).toHaveBeenCalledWith("r1", ["p1"]);
  });

  it("muestra la marca urgente", () => {
    renderPanel("aprobada", "ventas", { urgent: true });
    expect(screen.getByText("Urgente")).toBeInTheDocument();
  });

  it("sin acciones (anulada) solo muestra el estado y la ubicación", () => {
    renderPanel("anulada", "admin");
    expect(screen.queryByRole("group")).toBeNull();
    expect(screen.getByText("Anulado")).toBeInTheDocument();
    expect(screen.getByText("Anulada")).toBeInTheDocument();
  });

  it("aprueba al instante y muestra el estado de forma optimista", async () => {
    const user = userEvent.setup();
    renderPanel("registrada", "ventas", { arrivedAt: ARRIVED });
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
    const { unmount } = renderPanel("aprobada", "logistica", {
      arrivedAt: ARRIVED,
    });
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

    renderPanel("aprobada", "logistica", {
      arrivedAt: ARRIVED,
      workshopId: workshops[0]!.id,
    });
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
    const p = (status: PieceStatus) => ({
      status,
      arrivedAt: ARRIVED,
      readyForDelivery: false,
      returnedAt: null,
    });
    expect(
      commonTransitions([p("aprobada"), p("observada")], "logistica").map(
        (c) => c.to,
      ),
    ).toEqual(["enviada_taller"]);
    const anular = commonTransitions(
      [p("registrada"), p("aprobada")],
      "ventas",
    );
    // Registrada puede consultar, aprobar o anular; Aprobada solo anular.
    expect(anular.map((c) => c.to)).toEqual(["anulada"]);
    expect(anular.find((c) => c.to === "anulada")?.requiresNote).toBe(true);
    expect(commonTransitions([], "admin")).toEqual([]);
  });
});
