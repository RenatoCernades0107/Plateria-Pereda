import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  forbidden: false,
  role: "logistica" as "logistica" | "ventas" | "admin",
  permission: vi.fn(),
  rpc: vi.fn(),
  result: { error: null as { code?: string; message?: string } | null },
  facts: [] as object[],
  undoIds: null as number[] | null,
  revalidate: vi.fn(),
}));

vi.mock("@/server/auth", () => ({
  requirePermission: async (permission: string) => {
    mocks.permission(permission);
    if (mocks.forbidden) throw new Error("FORBIDDEN");
    return { id: "00000000-0000-4000-8000-000000000007", role: mocks.role };
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async (name: string, args: object) => {
      mocks.rpc(name, args);
      if (name === "piece_requirement_facts")
        return { data: mocks.facts, error: null };
      if (name === "piece_move_undo_ids")
        return { data: mocks.undoIds, error: null };
      return mocks.result;
    },
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/server/shopify-sync/run", () => ({ scheduleShopifySync: vi.fn() }));

const {
  changePieceStatus,
  receiveFromWorkshop,
  receivePiecesFromReview,
  sendPiecesForReview,
  sendPiecesToWorkshop,
  setPiecesUrgent,
  setRestorationKind,
  changePiecePrice,
  undoPieceMove,
} = await import("./status-actions");

describe("revisión en taller", () => {
  beforeEach(() => {
    mocks.forbidden = false;
    for (const fn of [mocks.permission, mocks.rpc, mocks.revalidate])
      fn.mockReset();
    mocks.result = { error: null };
  });

  it("«Llevar al taller a revisar» llama a la BD con el taller y refresca las vistas", async () => {
    expect(
      await sendPiecesForReview(
        "00000000-0000-4000-8000-000000000004",
        [
          "00000000-0000-4000-8000-000000000001",
          "00000000-0000-4000-8000-000000000002",
        ],
        "00000000-0000-4000-8000-000000000005",
      ),
    ).toEqual({
      ok: true,
    });
    expect(mocks.permission).toHaveBeenCalledWith(
      "piezas.enviar-recibir-taller",
    );
    expect(mocks.rpc).toHaveBeenCalledWith("send_pieces_for_review", {
      p_piece_ids: [
        "00000000-0000-4000-8000-000000000001",
        "00000000-0000-4000-8000-000000000002",
      ],
      p_workshop_id: "00000000-0000-4000-8000-000000000005",
    });
    expect(mocks.revalidate).toHaveBeenCalledWith(
      "/restauraciones/00000000-0000-4000-8000-000000000004",
    );
    expect(mocks.revalidate).toHaveBeenCalledWith("/piezas");
  });

  it("exige piezas y taller antes de llamar a la BD", async () => {
    expect(
      await sendPiecesForReview(
        "00000000-0000-4000-8000-000000000004",
        [],
        "00000000-0000-4000-8000-000000000005",
      ),
    ).toEqual({
      error: "Elige al menos una pieza.",
    });
    expect(
      await sendPiecesForReview(
        null,
        ["00000000-0000-4000-8000-000000000001"],
        null,
      ),
    ).toEqual({
      error: "Elige el taller al que se lleva la pieza.",
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("muestra el mensaje de la BD (en español) o uno genérico", async () => {
    mocks.result = {
      error: {
        code: "23514",
        message: "La pieza RES-00001-1 ya está en el taller por revisión.",
      },
    };
    expect(
      await sendPiecesForReview(
        null,
        ["00000000-0000-4000-8000-000000000001"],
        "00000000-0000-4000-8000-000000000005",
      ),
    ).toEqual({
      error: "La pieza RES-00001-1 ya está en el taller por revisión.",
    });
    mocks.result = { error: { code: "XX000", message: "boom" } };
    expect(
      await receivePiecesFromReview(null, [
        "00000000-0000-4000-8000-000000000001",
      ]),
    ).toEqual({
      error: "No se pudo registrar la vuelta de la revisión.",
    });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("«Volvió de revisión» llama a la BD (sin restauración: solo la vista de piezas)", async () => {
    expect(
      await receivePiecesFromReview(null, [
        "00000000-0000-4000-8000-000000000001",
      ]),
    ).toEqual({ ok: true });
    expect(mocks.permission).toHaveBeenCalledWith(
      "piezas.enviar-recibir-taller",
    );
    expect(mocks.rpc).toHaveBeenCalledWith("receive_pieces_from_review", {
      p_piece_ids: ["00000000-0000-4000-8000-000000000001"],
    });
    expect(mocks.revalidate).toHaveBeenCalledWith("/piezas");
    expect(mocks.revalidate).not.toHaveBeenCalledWith(
      expect.stringMatching(/^\/restauraciones/),
    );
  });

  it("sin permiso no llama a la BD", async () => {
    mocks.forbidden = true;
    await expect(
      sendPiecesForReview(
        "00000000-0000-4000-8000-000000000004",
        ["00000000-0000-4000-8000-000000000001"],
        "00000000-0000-4000-8000-000000000005",
      ),
    ).rejects.toThrow("FORBIDDEN");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe("enviar al taller", () => {
  beforeEach(() => {
    mocks.forbidden = false;
    for (const fn of [mocks.permission, mocks.rpc, mocks.revalidate])
      fn.mockReset();
    mocks.result = { error: null };
    mocks.facts = [];
  });

  const fact = (workshopId: string | null) => ({
    piece_id: "00000000-0000-4000-8000-000000000001",
    code: "RES-00001-1",
    has_price: true,
    has_service_cost: true,
    has_after_photo: false,
    workshop_id: workshopId,
  });

  it("llama a la BD con el taller elegido y refresca las vistas", async () => {
    mocks.facts = [fact(null)];
    expect(
      await sendPiecesToWorkshop(
        ["00000000-0000-4000-8000-000000000001"],
        "00000000-0000-4000-8000-000000000005",
      ),
    ).toEqual({ ok: true });
    expect(mocks.permission).toHaveBeenCalledWith(
      "piezas.enviar-recibir-taller",
    );
    expect(mocks.rpc).toHaveBeenCalledWith("send_pieces_to_workshop", {
      p_piece_ids: ["00000000-0000-4000-8000-000000000001"],
      p_workshop_id: "00000000-0000-4000-8000-000000000005",
    });
    expect(mocks.revalidate).toHaveBeenCalledWith("/piezas");
    expect(mocks.revalidate).toHaveBeenCalledWith(
      "/restauraciones/[id]",
      "page",
    );
  });

  it("sin taller elegido usa el de la pieza; sin ninguno avisa antes de la BD", async () => {
    mocks.facts = [fact("00000000-0000-4000-8000-000000000006")];
    expect(
      await sendPiecesToWorkshop(
        ["00000000-0000-4000-8000-000000000001"],
        null,
      ),
    ).toEqual({ ok: true });
    expect(mocks.rpc).toHaveBeenCalledWith("send_pieces_to_workshop", {
      p_piece_ids: ["00000000-0000-4000-8000-000000000001"],
      p_workshop_id: undefined,
    });
    mocks.rpc.mockReset();
    mocks.facts = [fact(null)];
    expect(
      await sendPiecesToWorkshop(
        ["00000000-0000-4000-8000-000000000001"],
        null,
      ),
    ).toEqual({
      error:
        "Falta el taller de RES-00001-1 para enviarla al taller. Complétalo en el detalle de la pieza.",
    });
    expect(mocks.rpc).not.toHaveBeenCalledWith(
      "send_pieces_to_workshop",
      expect.anything(),
    );
  });

  it("muestra el mensaje de la BD", async () => {
    mocks.facts = [fact("00000000-0000-4000-8000-000000000005")];
    mocks.result = {
      error: {
        code: "23514",
        message: "La pieza RES-00001-1 ya está en el taller.",
      },
    };
    expect(
      await sendPiecesToWorkshop(
        ["00000000-0000-4000-8000-000000000001"],
        null,
      ),
    ).toEqual({
      error: "La pieza RES-00001-1 ya está en el taller.",
    });
  });
});

describe("tipo de guía", () => {
  beforeEach(() => {
    mocks.forbidden = false;
    for (const fn of [mocks.permission, mocks.rpc, mocks.revalidate])
      fn.mockReset();
    mocks.result = { error: null };
  });

  it("llama a set_restoration_kind (admin y ventas) y refresca la guía", async () => {
    expect(
      await setRestorationKind(
        "00000000-0000-4000-8000-000000000004",
        "interno",
      ),
    ).toEqual({ ok: true });
    expect(mocks.permission).toHaveBeenCalledWith("restauraciones.editar");
    expect(mocks.rpc).toHaveBeenCalledWith("set_restoration_kind", {
      p_restoration_id: "00000000-0000-4000-8000-000000000004",
      p_kind: "interno",
    });
    expect(mocks.revalidate).toHaveBeenCalledWith(
      "/restauraciones/00000000-0000-4000-8000-000000000004",
    );
  });

  it("rechaza un tipo desconocido y muestra el motivo de la BD", async () => {
    expect(
      await setRestorationKind(
        "00000000-0000-4000-8000-000000000004",
        "otro" as unknown as "normal",
      ),
    ).toEqual({ error: "Elige el tipo de guía." });
    mocks.result = {
      error: {
        code: "23514",
        message:
          "La guía tiene pagos registrados: no se puede cambiar su tipo.",
      },
    };
    expect(
      await setRestorationKind(
        "00000000-0000-4000-8000-000000000004",
        "observado",
      ),
    ).toEqual({
      error: "La guía tiene pagos registrados: no se puede cambiar su tipo.",
    });
  });
});

describe("marcar urgente", () => {
  beforeEach(() => {
    mocks.forbidden = false;
    mocks.role = "logistica";
    for (const fn of [mocks.permission, mocks.rpc, mocks.revalidate])
      fn.mockReset();
    mocks.result = { error: null };
  });

  it("marca las piezas como urgentes y refresca las vistas", async () => {
    expect(
      await setPiecesUrgent(
        [
          "00000000-0000-4000-8000-000000000001",
          "00000000-0000-4000-8000-000000000002",
        ],
        true,
        "2026-11-05",
      ),
    ).toEqual({
      ok: true,
    });
    expect(mocks.permission).toHaveBeenCalledWith("piezas.marcar-urgente");
    expect(mocks.rpc).toHaveBeenCalledWith("set_pieces_urgent", {
      p_piece_ids: [
        "00000000-0000-4000-8000-000000000001",
        "00000000-0000-4000-8000-000000000002",
      ],
      p_urgent: true,
      p_estimated_delivery_date: "2026-11-05",
    });
    expect(mocks.revalidate).toHaveBeenCalledWith(
      "/restauraciones/[id]",
      "page",
    );
    expect(mocks.revalidate).toHaveBeenCalledWith("/piezas");
    expect(mocks.revalidate).toHaveBeenCalledWith("/piezas/[id]", "page");
  });

  it("quita la marca", async () => {
    expect(
      await setPiecesUrgent(["00000000-0000-4000-8000-000000000001"], false),
    ).toEqual({ ok: true });
    expect(mocks.rpc).toHaveBeenCalledWith("set_pieces_urgent", {
      p_piece_ids: ["00000000-0000-4000-8000-000000000001"],
      p_urgent: false,
    });
  });

  it("lleva la fecha del taller; en bloque puede conservar la de cada pieza", async () => {
    await setPiecesUrgent(
      ["00000000-0000-4000-8000-000000000001"],
      true,
      "2026-11-05",
      {
        workshopDeliveryDate: "2026-11-03",
      },
    );
    expect(mocks.rpc).toHaveBeenLastCalledWith("set_pieces_urgent", {
      p_piece_ids: ["00000000-0000-4000-8000-000000000001"],
      p_urgent: true,
      p_estimated_delivery_date: "2026-11-05",
      p_workshop_delivery_date: "2026-11-03",
    });
    await setPiecesUrgent(
      [
        "00000000-0000-4000-8000-000000000001",
        "00000000-0000-4000-8000-000000000002",
      ],
      true,
      "2026-11-05",
      {
        keepWorkshopDate: true,
      },
    );
    expect(mocks.rpc).toHaveBeenLastCalledWith("set_pieces_urgent", {
      p_piece_ids: [
        "00000000-0000-4000-8000-000000000001",
        "00000000-0000-4000-8000-000000000002",
      ],
      p_urgent: true,
      p_estimated_delivery_date: "2026-11-05",
      p_keep_workshop_date: true,
    });
  });

  it("ventas no cambia la fecha del taller: se ignora y cada pieza conserva la suya", async () => {
    mocks.role = "ventas";
    await setPiecesUrgent(
      ["00000000-0000-4000-8000-000000000001"],
      true,
      "2026-11-05",
      {
        workshopDeliveryDate: "2026-11-03",
      },
    );
    expect(mocks.rpc).toHaveBeenLastCalledWith("set_pieces_urgent", {
      p_piece_ids: ["00000000-0000-4000-8000-000000000001"],
      p_urgent: true,
      p_estimated_delivery_date: "2026-11-05",
      p_keep_workshop_date: true,
    });
  });

  it("la fecha del taller no puede ser posterior a la del cliente", async () => {
    mocks.rpc.mockClear();
    expect(
      await setPiecesUrgent(
        ["00000000-0000-4000-8000-000000000001"],
        true,
        "2026-11-05",
        {
          workshopDeliveryDate: "2026-11-06",
        },
      ),
    ).toEqual({
      error: "La fecha del taller no puede ser posterior a la del cliente.",
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("marcar urgente exige la fecha estimada de entrega antes de llamar a la BD", async () => {
    expect(
      await setPiecesUrgent(["00000000-0000-4000-8000-000000000001"], true),
    ).toEqual({
      error: "Indica la fecha estimada de entrega.",
    });
    expect(
      await setPiecesUrgent(["00000000-0000-4000-8000-000000000001"], true, ""),
    ).toEqual({
      error: "Indica la fecha estimada de entrega.",
    });
    expect(
      await setPiecesUrgent(
        ["00000000-0000-4000-8000-000000000001"],
        true,
        "2026-02-30",
      ),
    ).toEqual({
      error: "Ingresa una fecha válida.",
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("exige piezas antes de llamar a la BD", async () => {
    expect(await setPiecesUrgent([], true)).toEqual({
      error: "Elige al menos una pieza.",
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("muestra el mensaje de la BD (en español) o uno genérico", async () => {
    mocks.result = {
      error: {
        code: "23514",
        message: "Una pieza cerrada o entregada no se marca como urgente.",
      },
    };
    expect(
      await setPiecesUrgent(
        ["00000000-0000-4000-8000-000000000001"],
        true,
        "2026-11-05",
      ),
    ).toEqual({
      error: "Una pieza cerrada o entregada no se marca como urgente.",
    });
    mocks.result = { error: { code: "XX000", message: "boom" } };
    expect(
      await setPiecesUrgent(["00000000-0000-4000-8000-000000000001"], false),
    ).toEqual({
      error: "No se pudo quitar la marca de urgente.",
    });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("sin permiso no llama a la BD", async () => {
    mocks.forbidden = true;
    await expect(
      setPiecesUrgent(["00000000-0000-4000-8000-000000000001"], true),
    ).rejects.toThrow("FORBIDDEN");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe("cambiar precio con la orden creada", () => {
  beforeEach(() => {
    mocks.forbidden = false;
    for (const fn of [mocks.permission, mocks.rpc, mocks.revalidate])
      fn.mockReset();
    mocks.result = { error: null };
  });

  it("lo pide el permiso del precio de venta (admin y logística)", async () => {
    expect(
      await changePiecePrice(
        "00000000-0000-4000-8000-000000000004",
        "00000000-0000-4000-8000-000000000001",
        12050,
        "Más trabajo",
      ),
    ).toEqual({
      ok: true,
    });
    expect(mocks.permission).toHaveBeenCalledWith("piezas.precio-venta");
    expect(mocks.rpc).toHaveBeenCalledWith("change_piece_price", {
      p_piece_id: "00000000-0000-4000-8000-000000000001",
      p_price: 120.5,
      p_reason: "Más trabajo",
    });
    expect(mocks.revalidate).toHaveBeenCalledWith(
      "/restauraciones/00000000-0000-4000-8000-000000000004",
    );
  });
});

describe("deshacer un movimiento del kanban", () => {
  beforeEach(() => {
    mocks.forbidden = false;
    for (const fn of [mocks.permission, mocks.rpc, mocks.revalidate])
      fn.mockReset();
    mocks.result = { error: null };
    mocks.facts = [];
    mocks.undoIds = null;
  });

  it("los movimientos devuelven los eventos que «Deshacer» revierte", async () => {
    mocks.undoIds = [41];
    expect(
      await changePieceStatus(
        "00000000-0000-4000-8000-000000000004",
        ["00000000-0000-4000-8000-000000000001"],
        "en_espera",
        null,
        null,
      ),
    ).toEqual({ ok: true, undoIds: [41] });
    expect(mocks.rpc).toHaveBeenCalledWith("piece_move_undo_ids", {
      p_piece_ids: ["00000000-0000-4000-8000-000000000001"],
    });

    mocks.undoIds = [42, 43];
    expect(
      await receivePiecesFromReview(null, [
        "00000000-0000-4000-8000-000000000001",
        "00000000-0000-4000-8000-000000000002",
      ]),
    ).toEqual({
      ok: true,
      undoIds: [42, 43],
    });
    expect(
      await sendPiecesForReview(
        null,
        [
          "00000000-0000-4000-8000-000000000001",
          "00000000-0000-4000-8000-000000000002",
        ],
        "00000000-0000-4000-8000-000000000005",
      ),
    ).toEqual({
      ok: true,
      undoIds: [42, 43],
    });
    expect(
      await receiveFromWorkshop("00000000-0000-4000-8000-000000000004", [
        "00000000-0000-4000-8000-000000000001",
        "00000000-0000-4000-8000-000000000002",
      ]),
    ).toEqual({
      ok: true,
      undoIds: [42, 43],
    });
  });

  it("si la BD no ofrece deshacer (Shopify, pago, otro usuario), el resultado es el de siempre", async () => {
    mocks.undoIds = [];
    expect(
      await changePieceStatus(
        "00000000-0000-4000-8000-000000000004",
        ["00000000-0000-4000-8000-000000000001"],
        "en_espera",
        null,
        null,
      ),
    ).toEqual({ ok: true });
  });

  it("un movimiento que falla no consulta qué deshacer", async () => {
    mocks.result = { error: { code: "23514", message: "No se puede." } };
    expect(
      await receiveFromWorkshop("00000000-0000-4000-8000-000000000004", [
        "00000000-0000-4000-8000-000000000001",
      ]),
    ).toEqual({
      error: "No se puede.",
    });
    expect(mocks.rpc).not.toHaveBeenCalledWith(
      "piece_move_undo_ids",
      expect.anything(),
    );
  });

  it("«Deshacer» llama a la BD con los eventos y refresca las vistas", async () => {
    expect(
      await undoPieceMove("00000000-0000-4000-8000-000000000004", [41]),
    ).toEqual({ ok: true });
    expect(mocks.permission).toHaveBeenCalledWith("restauraciones.ver");
    expect(mocks.rpc).toHaveBeenCalledWith("undo_piece_move", {
      p_history_ids: [41],
    });
    expect(mocks.revalidate).toHaveBeenCalledWith(
      "/restauraciones/00000000-0000-4000-8000-000000000004",
    );
    expect(mocks.revalidate).toHaveBeenCalledWith(
      "/restauraciones/[id]",
      "page",
    );
    expect(mocks.revalidate).toHaveBeenCalledWith("/piezas");
  });

  it("muestra el motivo de la BD si ya no se puede deshacer", async () => {
    mocks.result = {
      error: {
        code: "23514",
        message:
          "Ya pasó el tiempo para deshacer el movimiento de la pieza RES-00001-1.",
      },
    };
    expect(await undoPieceMove(null, [41])).toEqual({
      error:
        "Ya pasó el tiempo para deshacer el movimiento de la pieza RES-00001-1.",
    });
    mocks.result = { error: { code: "XX000", message: "boom" } };
    expect(await undoPieceMove(null, [41])).toEqual({
      error: "No se pudo deshacer el movimiento.",
    });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("sin eventos o sin permiso no llama a la BD", async () => {
    expect(await undoPieceMove(null, [])).toEqual({
      error: "No hay ningún movimiento que deshacer.",
    });
    mocks.forbidden = true;
    await expect(undoPieceMove(null, [41])).rejects.toThrow("FORBIDDEN");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe("argumentos de las acciones (15.1)", () => {
  beforeEach(() => {
    mocks.forbidden = false;
    for (const fn of [mocks.permission, mocks.rpc, mocks.revalidate])
      fn.mockReset();
  });

  it("rechaza ids que no son uuid sin llamar a la BD ni refrescar rutas", async () => {
    const invalid = {
      error: "Datos inválidos. Recarga la página e intenta de nuevo.",
    };
    expect(
      await changePieceStatus("../../usuarios", ["x"], "aprobada"),
    ).toEqual(invalid);
    expect(
      await sendPiecesToWorkshop(
        "00000000-0000-4000-8000-000000000001" as never,
        null,
      ),
    ).toEqual(invalid);
    expect(
      await changePieceStatus(
        null,
        ["00000000-0000-4000-8000-000000000001"],
        "inventado" as never,
      ),
    ).toEqual(invalid);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("valida después del permiso: quien no puede recibe 403", async () => {
    mocks.forbidden = true;
    await expect(changePieceStatus("x", [], "aprobada")).rejects.toThrow(
      "FORBIDDEN",
    );
  });
});
