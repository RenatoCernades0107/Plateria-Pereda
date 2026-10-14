import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  forbidden: false,
  update: vi.fn(),
  result: { data: [{ restoration_id: "r1" }], error: null } as {
    data: { restoration_id: string }[] | null;
    error: { code: string; message: string } | null;
  },
  schedule: vi.fn(),
}));

vi.mock("@/server/auth", () => ({
  requirePermission: async (permission: string) => {
    if (mocks.forbidden) throw new Error("FORBIDDEN");
    expect(permission).toBe("piezas.precio-venta");
    return { id: "u1", role: "admin" };
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({
      update: (values: unknown) => {
        mocks.update(values);
        return {
          eq: () => ({ select: async () => mocks.result }),
        };
      },
    }),
  }),
}));
vi.mock("@/server/shopify-sync/run", () => ({
  scheduleShopifySync: mocks.schedule,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { setPieceSalePrice } = await import("./sale-price-actions");

describe("setPieceSalePrice", () => {
  beforeEach(() => {
    mocks.forbidden = false;
    mocks.update.mockReset();
    mocks.schedule.mockReset();
    mocks.result = { data: [{ restoration_id: "r1" }], error: null };
  });

  it("guarda el precio en soles y revisa la orden de Shopify", async () => {
    expect(await setPieceSalePrice("p1", " S/ 1,234.50 ")).toEqual({
      ok: true,
    });
    expect(mocks.update).toHaveBeenCalledWith({ price: 1234.5 });
    expect(mocks.schedule).toHaveBeenCalled();
  });

  it("texto vacío deja el precio sin asignar", async () => {
    expect(await setPieceSalePrice("p1", "  ")).toEqual({ ok: true });
    expect(mocks.update).toHaveBeenCalledWith({ price: null });
  });

  it("rechaza montos inválidos sin llamar a la BD", async () => {
    for (const bad of ["abc", "-5", "1.234"]) {
      expect(await setPieceSalePrice("p1", bad)).toEqual({
        error: "Ingresa un monto válido (hasta 2 decimales).",
      });
    }
    expect(mocks.update).not.toHaveBeenCalled();
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

  it("solo el admin", async () => {
    mocks.forbidden = true;
    await expect(setPieceSalePrice("p1", "10")).rejects.toThrow("FORBIDDEN");
  });
});
