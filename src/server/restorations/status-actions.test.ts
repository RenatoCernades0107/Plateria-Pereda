import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  forbidden: false,
  permission: vi.fn(),
  rpc: vi.fn(),
  result: { error: null as { code?: string; message?: string } | null },
  facts: [] as object[],
  revalidate: vi.fn(),
}));

vi.mock("@/server/auth", () => ({
  requirePermission: async (permission: string) => {
    mocks.permission(permission);
    if (mocks.forbidden) throw new Error("FORBIDDEN");
    return { id: "u1", role: "logistica" };
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async (name: string, args: object) => {
      mocks.rpc(name, args);
      if (name === "piece_requirement_facts")
        return { data: mocks.facts, error: null };
      return mocks.result;
    },
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/server/shopify-sync/run", () => ({ scheduleShopifySync: vi.fn() }));

const {
  receivePiecesFromReview,
  sendPiecesForReview,
  sendPiecesToWorkshop,
  setRestorationKind,
} = await import("./status-actions");

describe("revisión en taller", () => {
  beforeEach(() => {
    mocks.forbidden = false;
    for (const fn of [mocks.permission, mocks.rpc, mocks.revalidate])
      fn.mockReset();
    mocks.result = { error: null };
  });

  it("«Llevar al taller a revisar» llama a la BD con el taller y refresca las vistas", async () => {
    expect(await sendPiecesForReview("r1", ["p1", "p2"], "w1")).toEqual({
      ok: true,
    });
    expect(mocks.permission).toHaveBeenCalledWith(
      "piezas.enviar-recibir-taller",
    );
    expect(mocks.rpc).toHaveBeenCalledWith("send_pieces_for_review", {
      p_piece_ids: ["p1", "p2"],
      p_workshop_id: "w1",
    });
    expect(mocks.revalidate).toHaveBeenCalledWith("/restauraciones/r1");
    expect(mocks.revalidate).toHaveBeenCalledWith("/piezas");
  });

  it("exige piezas y taller antes de llamar a la BD", async () => {
    expect(await sendPiecesForReview("r1", [], "w1")).toEqual({
      error: "Elige al menos una pieza.",
    });
    expect(await sendPiecesForReview(null, ["p1"], null)).toEqual({
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
    expect(await sendPiecesForReview(null, ["p1"], "w1")).toEqual({
      error: "La pieza RES-00001-1 ya está en el taller por revisión.",
    });
    mocks.result = { error: { code: "XX000", message: "boom" } };
    expect(await receivePiecesFromReview(null, ["p1"])).toEqual({
      error: "No se pudo registrar la vuelta de la revisión.",
    });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("«Volvió de revisión» llama a la BD (sin restauración: solo la vista de piezas)", async () => {
    expect(await receivePiecesFromReview(null, ["p1"])).toEqual({ ok: true });
    expect(mocks.permission).toHaveBeenCalledWith(
      "piezas.enviar-recibir-taller",
    );
    expect(mocks.rpc).toHaveBeenCalledWith("receive_pieces_from_review", {
      p_piece_ids: ["p1"],
    });
    expect(mocks.revalidate).toHaveBeenCalledWith("/piezas");
    expect(mocks.revalidate).not.toHaveBeenCalledWith(
      expect.stringMatching(/^\/restauraciones/),
    );
  });

  it("sin permiso no llama a la BD", async () => {
    mocks.forbidden = true;
    await expect(sendPiecesForReview("r1", ["p1"], "w1")).rejects.toThrow(
      "FORBIDDEN",
    );
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
    piece_id: "p1",
    code: "RES-00001-1",
    has_price: true,
    has_service_cost: true,
    has_after_photo: false,
    workshop_id: workshopId,
  });

  it("llama a la BD con el taller elegido y refresca las vistas", async () => {
    mocks.facts = [fact(null)];
    expect(await sendPiecesToWorkshop(["p1"], "w1")).toEqual({ ok: true });
    expect(mocks.permission).toHaveBeenCalledWith(
      "piezas.enviar-recibir-taller",
    );
    expect(mocks.rpc).toHaveBeenCalledWith("send_pieces_to_workshop", {
      p_piece_ids: ["p1"],
      p_workshop_id: "w1",
    });
    expect(mocks.revalidate).toHaveBeenCalledWith("/piezas");
    expect(mocks.revalidate).toHaveBeenCalledWith(
      "/restauraciones/[id]",
      "page",
    );
  });

  it("sin taller elegido usa el de la pieza; sin ninguno avisa antes de la BD", async () => {
    mocks.facts = [fact("w9")];
    expect(await sendPiecesToWorkshop(["p1"], null)).toEqual({ ok: true });
    expect(mocks.rpc).toHaveBeenCalledWith("send_pieces_to_workshop", {
      p_piece_ids: ["p1"],
      p_workshop_id: undefined,
    });
    mocks.rpc.mockReset();
    mocks.facts = [fact(null)];
    expect(await sendPiecesToWorkshop(["p1"], null)).toEqual({
      error:
        "Falta el taller de RES-00001-1 para enviarla al taller. Complétalo en el detalle de la pieza.",
    });
    expect(mocks.rpc).not.toHaveBeenCalledWith(
      "send_pieces_to_workshop",
      expect.anything(),
    );
  });

  it("muestra el mensaje de la BD", async () => {
    mocks.facts = [fact("w1")];
    mocks.result = {
      error: {
        code: "23514",
        message: "La pieza RES-00001-1 ya está en el taller.",
      },
    };
    expect(await sendPiecesToWorkshop(["p1"], null)).toEqual({
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
    expect(await setRestorationKind("r1", "interno")).toEqual({ ok: true });
    expect(mocks.permission).toHaveBeenCalledWith("restauraciones.editar");
    expect(mocks.rpc).toHaveBeenCalledWith("set_restoration_kind", {
      p_restoration_id: "r1",
      p_kind: "interno",
    });
    expect(mocks.revalidate).toHaveBeenCalledWith("/restauraciones/r1");
  });

  it("rechaza un tipo desconocido y muestra el motivo de la BD", async () => {
    expect(
      await setRestorationKind("r1", "otro" as unknown as "normal"),
    ).toEqual({ error: "Elige el tipo de guía." });
    mocks.result = {
      error: {
        code: "23514",
        message:
          "La guía tiene pagos registrados: no se puede cambiar su tipo.",
      },
    };
    expect(await setRestorationKind("r1", "observado")).toEqual({
      error: "La guía tiene pagos registrados: no se puede cambiar su tipo.",
    });
  });
});
