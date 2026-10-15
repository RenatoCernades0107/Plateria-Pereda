import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  forbidden: false,
  permission: vi.fn(),
  rpc: vi.fn(),
  result: { error: null as { code?: string; message?: string } | null },
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
      return mocks.result;
    },
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/server/shopify-sync/run", () => ({ scheduleShopifySync: vi.fn() }));

const { receivePiecesFromReview, sendPiecesForReview } =
  await import("./status-actions");

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
