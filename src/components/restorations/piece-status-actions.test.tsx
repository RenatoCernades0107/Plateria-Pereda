import { cleanup, render, screen, within } from "@testing-library/react";
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
  sendReview: vi.fn(),
  backFromReview: vi.fn(),
  undo: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/server/restorations/status-actions", () => ({
  changePieceStatus: (...a: unknown[]) => mocks.change(...a),
  markPiecesArrived: (...a: unknown[]) => mocks.arrive(...a),
  receiveFromWorkshop: (...a: unknown[]) => mocks.receive(...a),
  returnPiecesToClient: (...a: unknown[]) => mocks.giveBack(...a),
  sendPiecesForReview: (...a: unknown[]) => mocks.sendReview(...a),
  receivePiecesFromReview: (...a: unknown[]) => mocks.backFromReview(...a),
  undoPieceStatus: (...a: unknown[]) => mocks.undo(...a),
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
    reviewSentAt?: string | null;
    previousStatus?: PieceStatus | null;
  } = {},
) {
  const arrivedAt = extra.arrivedAt ?? null;
  const readyForDelivery = extra.readyForDelivery ?? false;
  const reviewSentAt = extra.reviewSentAt ?? null;
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
          reviewSentAt: reviewSentAt ? new Date(reviewSentAt) : null,
        }),
        arrivedAt,
        workshopId: extra.workshopId ?? null,
        readyForDelivery,
        returnedAt: null,
        urgent: extra.urgent ?? false,
        reviewSentAt,
        reviewReturnedAt: null,
      }}
      role={role}
      workshops={workshops}
      previousStatus={extra.previousStatus ?? null}
    />,
  );
}

const buttons = () =>
  within(screen.getByRole("group", { name: "Acciones de RES-00001-1" }))
    .getAllByRole("button")
    .map((b) => b.textContent);

/** Abre «Más acciones» y devuelve los cierres que ofrece. */
async function moreActions(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Más acciones" }));
  return screen.getAllByRole("menuitem").map((i) => i.textContent);
}

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset();
  mocks.change.mockResolvedValue({ ok: true });
  mocks.arrive.mockResolvedValue({ ok: true });
  mocks.receive.mockResolvedValue({ ok: true });
  mocks.giveBack.mockResolvedValue({ ok: true });
  mocks.sendReview.mockResolvedValue({ ok: true });
  mocks.backFromReview.mockResolvedValue({ ok: true });
  mocks.undo.mockResolvedValue({ ok: true });
});

describe("PieceStatusPanel", () => {
  it("muestra solo las acciones del rol: una principal y los cierres aparte", async () => {
    const user = userEvent.setup();
    renderPanel("registrada", "ventas");
    // La principal va primero; los cierres, en «Más acciones».
    expect(buttons()).toEqual([
      "Aprobar",
      "Marcar llegada a tienda",
      "Poner en consulta",
      "Más acciones",
    ]);
    expect(screen.getByRole("button", { name: "Aprobar" })).toHaveAttribute(
      "data-variant",
      "default",
    );
    expect(
      screen.getByRole("button", { name: "Poner en consulta" }),
    ).toHaveAttribute("data-variant", "outline");
    expect(await moreActions(user)).toEqual(["Anular"]);
  });

  it("el estado va aparte de las acciones", () => {
    renderPanel("registrada", "ventas");
    const group = screen.getByRole("group", {
      name: "Acciones de RES-00001-1",
    });
    const status = screen.getByText("Estado");
    expect(status.parentElement).toHaveTextContent("Registrada");
    expect(group).not.toContainElement(status);
  });

  it("Rechazar solo aparece en Espera respuesta cliente (P50)", async () => {
    const user = userEvent.setup();
    renderPanel("en_espera", "ventas");
    expect(buttons()[0]).toBe("Aprobar");
    expect(await moreActions(user)).toContain("Rechazar");
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
    expect(buttons()).toEqual(["Recibir del taller", "Más acciones"]);
    expect(screen.getByText("En taller")).toBeInTheDocument();
  });

  it("recibe la pieza del taller: sigue en En restauración, lista para entregar", async () => {
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
    expect(buttons()).toEqual(["Entregar", "Observar", "Más acciones"]);
    // "En tienda" = volvió del taller (P48).
    expect(screen.getByText("En tienda")).toBeInTheDocument();
    expect(screen.getByText("En restauración")).toBeInTheDocument();
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
    // Anular es un cierre: está en «Más acciones», no como botón.
    expect(screen.queryByRole("button", { name: "Anular" })).toBeNull();
    await moreActions(user);
    await user.click(screen.getByRole("menuitem", { name: "Anular" }));
    const dialog = await screen.findByRole("dialog");
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

describe("revisión en taller", () => {
  const SENT = "2026-10-05T10:00:00Z";

  it("logística lleva al taller a revisar una pieza en Consulta: elige el taller", async () => {
    const user = userEvent.setup();
    const { unmount } = renderPanel("en_consulta", "logistica", {
      arrivedAt: ARRIVED,
    });
    expect(buttons()).toEqual(["Llevar al taller a revisar"]);
    await user.click(
      screen.getByRole("button", { name: "Llevar al taller a revisar" }),
    );
    let dialog = screen.getByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", {
        name: "Confirmar: llevar al taller",
      }),
    );
    expect(
      within(dialog).getByText("Elige el taller al que se lleva la pieza."),
    ).toBeVisible();
    expect(mocks.sendReview).not.toHaveBeenCalled();
    unmount();

    renderPanel("en_consulta", "logistica", {
      arrivedAt: ARRIVED,
      workshopId: workshops[0]!.id,
    });
    await user.click(
      screen.getByRole("button", { name: "Llevar al taller a revisar" }),
    );
    dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText("Taller")).toHaveTextContent(
      "Taller Central",
    );
    await user.click(
      within(dialog).getByRole("button", {
        name: "Confirmar: llevar al taller",
      }),
    );
    expect(mocks.sendReview).toHaveBeenCalledWith(
      "r1",
      ["p1"],
      workshops[0]!.id,
    );
    expect(mocks.change).not.toHaveBeenCalled();
    expect(mocks.success).toHaveBeenCalledWith(
      "RES-00001-1: llevada al taller a revisar.",
    );
  });

  it("ventas no lleva piezas a revisar; tampoco sin llegar a la tienda", () => {
    const { unmount } = renderPanel("en_consulta", "ventas", {
      arrivedAt: ARRIVED,
    });
    expect(buttons()).not.toContain("Llevar al taller a revisar");
    unmount();
    renderPanel("en_consulta", "admin");
    expect(buttons()).not.toContain("Llevar al taller a revisar");
  });

  it("en revisión: En taller, «Volvió de revisión» y sin cierres", async () => {
    const user = userEvent.setup();
    renderPanel("en_espera", "admin", {
      arrivedAt: ARRIVED,
      workshopId: workshops[0]!.id,
      reviewSentAt: SENT,
    });
    expect(screen.getByText("En taller")).toBeInTheDocument();
    expect(screen.getByText("Espera respuesta cliente")).toBeInTheDocument();
    // Aprobar sigue disponible; Rechazar y Anular, no (primero vuelve).
    expect(buttons()).toEqual(["Volvió de revisión", "Aprobar"]);
    await user.click(
      screen.getByRole("button", { name: "Volvió de revisión" }),
    );
    expect(mocks.backFromReview).toHaveBeenCalledWith("r1", ["p1"]);
    expect(mocks.success).toHaveBeenCalledWith(
      "RES-00001-1: volvió de revisión.",
    );
  });

  it("aprobada en revisión pasa a En restauración en el mismo taller", () => {
    renderPanel("aprobada", "logistica", {
      arrivedAt: ARRIVED,
      workshopId: workshops[0]!.id,
      reviewSentAt: SENT,
    });
    expect(buttons()).toEqual(["Volvió de revisión", "Enviar al taller"]);
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

describe("Retroceder estado", () => {
  it("no se ofrece sin estado anterior ni a un rol que no podía hacer el avance", async () => {
    const user = userEvent.setup();
    renderPanel("aprobada", "ventas");
    expect(await moreActions(user)).toEqual(["Anular"]);
    cleanup();
    // aprobada → enviada_taller no es de ventas: no puede deshacerla.
    renderPanel("enviada_taller", "ventas", {
      arrivedAt: ARRIVED,
      previousStatus: "aprobada",
    });
    expect(screen.queryByRole("button", { name: "Más acciones" })).toBeNull();
  });

  it("va en «Más acciones», aparte de los cierres", async () => {
    const user = userEvent.setup();
    renderPanel("aprobada", "ventas", { previousStatus: "registrada" });
    expect(await moreActions(user)).toEqual(["Retroceder estado", "Anular"]);
  });

  it("pide el motivo y retrocede la pieza", async () => {
    const user = userEvent.setup();
    renderPanel("aprobada", "ventas", {
      arrivedAt: ARRIVED,
      previousStatus: "registrada",
    });
    await user.click(screen.getByRole("button", { name: "Más acciones" }));
    await user.click(
      screen.getByRole("menuitem", { name: "Retroceder estado" }),
    );

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("de «Aprobada» a «Registrada»");
    await user.click(within(dialog).getByRole("button", { name: /Confirmar/ }));
    expect(mocks.undo).not.toHaveBeenCalled();
    expect(dialog).toHaveTextContent("Escribe el motivo del retroceso.");

    await user.type(within(dialog).getByLabelText(/Motivo/), "Me equivoqué");
    await user.click(within(dialog).getByRole("button", { name: /Confirmar/ }));
    expect(mocks.undo).toHaveBeenCalledWith("r1", "p1", "Me equivoqué");
  });
});
