import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  forbidden: false,
  rpc: vi.fn(),
}));

vi.mock("@/server/auth", () => ({
  requirePermission: async () => {
    if (mocks.forbidden) throw new Error("FORBIDDEN");
    return { id: "u1", role: "logistica" };
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc: mocks.rpc }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { setPieceServiceCost } = await import("./service-cost-actions");

describe("setPieceServiceCost", () => {
  beforeEach(() => {
    mocks.forbidden = false;
    mocks.rpc.mockReset().mockResolvedValue({ error: null });
  });

  it("guarda el monto en soles", async () => {
    expect(await setPieceServiceCost("p1", " S/ 1,234.50 ")).toEqual({
      ok: true,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("set_piece_service_cost", {
      p_piece_id: "p1",
      p_cost: 1234.5,
    });
  });

  it("texto vacío deja el costo sin definir", async () => {
    expect(await setPieceServiceCost("p1", "  ")).toEqual({ ok: true });
    expect(mocks.rpc).toHaveBeenCalledWith("set_piece_service_cost", {
      p_piece_id: "p1",
      p_cost: null,
    });
  });

  it("rechaza montos inválidos sin llamar a la BD", async () => {
    for (const bad of ["abc", "-5", "1.234"]) {
      expect(await setPieceServiceCost("p1", bad)).toEqual({
        error: "Ingresa un monto válido (hasta 2 decimales).",
      });
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("muestra el mensaje de las reglas de la BD", async () => {
    mocks.rpc.mockResolvedValue({
      error: { code: "42501", message: "Tu rol no puede cambiar el costo." },
    });
    expect(await setPieceServiceCost("p1", "10")).toEqual({
      error: "Tu rol no puede cambiar el costo.",
    });
  });

  it("usa un mensaje genérico ante otros errores", async () => {
    mocks.rpc.mockResolvedValue({ error: { code: "XX000", message: "boom" } });
    expect(await setPieceServiceCost("p1", "10")).toEqual({
      error: "No se pudo guardar el costo de servicio.",
    });
  });

  it("sin permiso no llega a la BD", async () => {
    mocks.forbidden = true;
    await expect(setPieceServiceCost("p1", "10")).rejects.toThrow("FORBIDDEN");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
