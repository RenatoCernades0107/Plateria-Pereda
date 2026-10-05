import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeShopify } from "@/server/shopify/fake";

const mocks = vi.hoisted(() => ({
  forbidden: false,
  permission: "",
  failing: false,
}));

vi.mock("@/server/auth", () => ({
  requirePermission: async (permission: string) => {
    mocks.permission = permission;
    if (mocks.forbidden) throw new Error("FORBIDDEN");
    return { id: "u1", role: "ventas" };
  },
}));
vi.mock("@/server/shopify", async () => {
  const { FakeShopifyGateway } = await import("@/server/shopify/fake");
  const gateway = new FakeShopifyGateway();
  return {
    getShopifyGateway: () => {
      if (mocks.failing) {
        return {
          searchProducts: async () => {
            throw new Error("caído");
          },
          getProduct: async () => {
            throw new Error("caído");
          },
        };
      }
      return gateway;
    },
  };
});

const { getCatalogProduct, searchCatalog } = await import("./catalog-actions");

beforeEach(() => {
  mocks.forbidden = false;
  mocks.failing = false;
  fakeShopify.reset();
});

describe("searchCatalog", () => {
  it("busca en el catálogo con el permiso del cotizador", async () => {
    const result = await searchCatalog("  anillo ");
    expect(mocks.permission).toBe("cotizador.usar");
    expect(result).toEqual({
      ok: true,
      products: [
        expect.objectContaining({ title: "Anillo de plata personalizable" }),
      ],
    });
  });

  it("no busca con menos de 2 caracteres", async () => {
    expect(await searchCatalog("a")).toEqual({ ok: true, products: [] });
  });

  it("avisa si Shopify no responde", async () => {
    mocks.failing = true;
    expect(await searchCatalog("anillo")).toEqual({
      error: "Shopify no respondió. Intenta de nuevo.",
    });
    expect(await getCatalogProduct("gid://shopify/Product/1004")).toEqual({
      error: "Shopify no respondió. Intenta de nuevo.",
    });
  });

  it("sin permiso no busca", async () => {
    mocks.forbidden = true;
    await expect(searchCatalog("anillo")).rejects.toThrow("FORBIDDEN");
  });
});

describe("getCatalogProduct", () => {
  it("devuelve el producto con sus variantes", async () => {
    const result = await getCatalogProduct("gid://shopify/Product/1004");
    expect(result).toMatchObject({
      ok: true,
      product: {
        title: "Anillo de plata personalizable",
        variants: [
          { title: "Talla 6", price: "150.00" },
          { title: "Talla 8", price: "165.50" },
        ],
      },
    });
  });

  it("rechaza ids inválidos y productos que no existen", async () => {
    expect(await getCatalogProduct("1004")).toEqual({
      error: "Producto inválido.",
    });
    expect(await getCatalogProduct("gid://shopify/Product/9")).toEqual({
      error: "El producto ya no existe en Shopify.",
    });
  });
});
