import { describe, expect, it } from "vitest";

import { quoteTotals } from "./quote";
import {
  copyLine,
  draftAmounts,
  freeLine,
  lineFromCatalog,
  parsePercent,
  parseQuantity,
  variantName,
  type CatalogProduct,
} from "./quote-line";

const anillo: CatalogProduct = {
  id: "gid://shopify/Product/1004",
  title: "Anillo de plata personalizable",
  imageUrl: "https://cdn.shopify.com/anillo.jpg",
  variants: [
    {
      id: "gid://shopify/ProductVariant/2005",
      title: "Talla 6",
      price: "150.00",
      sku: "ANI-950-06",
      imageUrl: null,
    },
    {
      id: "gid://shopify/ProductVariant/2006",
      title: "Talla 8",
      price: "165.5",
      sku: "",
      imageUrl: "https://cdn.shopify.com/anillo-8.jpg",
    },
  ],
};

describe("lineFromCatalog", () => {
  it("copia el producto, la variante y el precio del catálogo", () => {
    expect(lineFromCatalog(anillo, anillo.variants[0]!, "k1")).toEqual({
      key: "k1",
      shopifyProductId: "gid://shopify/Product/1004",
      shopifyVariantId: "gid://shopify/ProductVariant/2005",
      title: "Anillo de plata personalizable",
      variantTitle: "Talla 6",
      sku: "ANI-950-06",
      imageUrl: "https://cdn.shopify.com/anillo.jpg",
      catalogPrice: "150.00",
      customization: "",
      quantity: "1",
      unitPrice: "150.00",
      discountType: "",
      discountValue: "",
    });
  });

  it("usa la imagen de la variante, normaliza el precio y omite el SKU vacío", () => {
    const line = lineFromCatalog(anillo, anillo.variants[1]!);
    expect(line).toMatchObject({
      imageUrl: "https://cdn.shopify.com/anillo-8.jpg",
      unitPrice: "165.50",
      catalogPrice: "165.50",
      sku: null,
    });
    expect(line.key).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('un producto sin opciones no muestra "Default Title"', () => {
    expect(variantName({ title: "Default Title" })).toBe("");
    expect(
      lineFromCatalog(anillo, {
        ...anillo.variants[0]!,
        title: "Default Title",
      }).variantTitle,
    ).toBe("");
  });
});

describe("líneas libres y copias", () => {
  it("una línea libre no tiene producto ni precio", () => {
    expect(freeLine("k2")).toMatchObject({
      key: "k2",
      shopifyProductId: null,
      shopifyVariantId: null,
      title: "",
      unitPrice: "",
      quantity: "1",
    });
  });

  it("una copia tiene otra clave", () => {
    const line = lineFromCatalog(anillo, anillo.variants[0]!, "k1");
    expect(copyLine(line, "k3")).toEqual({ ...line, key: "k3" });
  });
});

describe("montos de la línea en edición", () => {
  it("lee cantidad, precio y descuento", () => {
    const line = {
      ...lineFromCatalog(anillo, anillo.variants[0]!),
      quantity: "2",
      discountType: "porcentaje" as const,
      discountValue: "10",
    };
    expect(draftAmounts(line)).toEqual({
      quantity: 2,
      unitPrice: 150_00,
      discount: { type: "porcentaje", percent: 10 },
    });
    expect(
      draftAmounts({ ...line, discountType: "monto", discountValue: "5,50" })
        .discount,
    ).toEqual({ type: "monto", cents: 5_50 });
  });

  it("lo inválido cuenta como 0 en los totales en vivo", () => {
    const line = {
      ...freeLine(),
      quantity: "0",
      unitPrice: "abc",
      discountType: "porcentaje" as const,
      discountValue: "120",
    };
    expect(draftAmounts(line)).toEqual({
      quantity: 0,
      unitPrice: 0,
      discount: null,
    });
    expect(quoteTotals([draftAmounts(line)]).total).toBe(0);
  });

  it("parseQuantity y parsePercent", () => {
    expect(parseQuantity("12")).toBe(12);
    expect(parseQuantity("1.5")).toBeNull();
    expect(parseQuantity("0")).toBeNull();
    expect(parseQuantity("100000")).toBe(100_000);
    expect(parseQuantity("100001")).toBeNull();
    expect(parsePercent("12,5")).toBe(12.5);
    expect(parsePercent("100")).toBe(100);
    expect(parsePercent("100.01")).toBeNull();
    expect(parsePercent("-1")).toBeNull();
  });
});
