import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  forbidden: false,
  rpc: vi.fn(),
  result: { data: "r1", error: null } as {
    data: string | null;
    error: { code: string; message: string } | null;
  },
  schedule: vi.fn(),
  revalidate: vi.fn(),
}));

vi.mock("@/server/auth", () => ({
  requirePermission: async (permission: string) => {
    if (mocks.forbidden) throw new Error("FORBIDDEN");
    expect(permission).toBe("piezas.precio-venta");
    return { id: "u1", role: "logistica" };
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async (name: string, args: unknown) => {
      mocks.rpc(name, args);
      return mocks.result;
    },
  }),
}));
vi.mock("@/server/shopify-sync/run", () => ({
  scheduleShopifySync: mocks.schedule,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

const { setPieceSalePrice } = await import("./sale-price-actions");

describe("setPieceSalePrice", () => {
  beforeEach(() => {
    mocks.forbidden = false;
    mocks.rpc.mockReset();
    mocks.schedule.mockReset();
    mocks.revalidate.mockReset();
    mocks.result = { data: "r1", error: null };
  });

  it("guarda el precio en soles por la RPC y revisa la orden de Shopify", async () => {
    expect(await setPieceSalePrice("p1", " S/ 1,234.50 ")).toEqual({
      ok: true,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("set_piece_sale_price", {
      p_piece_id: "p1",
      p_price: 1234.5,
    });
    expect(mocks.schedule).toHaveBeenCalled();
    expect(mocks.revalidate).toHaveBeenCalledWith("/restauraciones/r1");
  });

  it("texto vacío deja el precio sin asignar", async () => {
    expect(await setPieceSalePrice("p1", "  ")).toEqual({ ok: true });
    expect(mocks.rpc).toHaveBeenCalledWith("set_piece_sale_price", {
      p_piece_id: "p1",
      p_price: null,
    });
  });

  it("rechaza montos inválidos sin llamar a la BD", async () => {
    for (const bad of ["abc", "-5", "1.234"]) {
      expect(await setPieceSalePrice("p1", bad)).toEqual({
        error: "Ingresa un monto válido (hasta 2 decimales).",
      });
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("muestra el mensaje de las reglas de la BD", async () => {
    mocks.result = {
      data: null,
      error: {
        code: "23514",
        message:
          "Con la orden de Shopify creada, el precio se cambia desde el flujo de la orden (P12)",
      },
    };
    expect(await setPieceSalePrice("p1", "10")).toEqual({
      error:
        "Con la orden de Shopify creada, el precio se cambia desde el flujo de la orden (P12)",
    });
    expect(mocks.schedule).not.toHaveBeenCalled();
  });

  it("la pieza que no existe (o de una guía pasada) trae el mensaje de la BD", async () => {
    mocks.result = {
      data: null,
      error: { code: "23503", message: "La pieza no existe" },
    };
    expect(await setPieceSalePrice("p1", "10")).toEqual({
      error: "La pieza no existe",
    });
  });

  it("otros errores, mensaje genérico", async () => {
    mocks.result = { data: null, error: { code: "XX000", message: "boom" } };
    expect(await setPieceSalePrice("p1", "10")).toEqual({
      error: "No se pudo guardar el precio de venta.",
    });
  });

  it("sin permiso (ventas) no llama a la BD", async () => {
    mocks.forbidden = true;
    await expect(setPieceSalePrice("p1", "10")).rejects.toThrow("FORBIDDEN");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
