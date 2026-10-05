import { describe, expect, it } from "vitest";

import { freeLine, type QuoteLineDraft } from "@/domain/quote-line";

import {
  quoteFormErrors,
  quoteRpcArgs,
  quoteSchema,
  type QuoteFormInput,
} from "./quotes";

const KEY_1 = "11111111-1111-4111-8111-111111111111";
const KEY_2 = "22222222-2222-4222-8222-222222222222";
const CLIENT = "33333333-3333-4333-8333-333333333333";

const anillo: QuoteLineDraft = {
  key: KEY_1,
  shopifyProductId: "gid://shopify/Product/1004",
  shopifyVariantId: "gid://shopify/ProductVariant/2006",
  title: "Anillo de plata personalizable",
  variantTitle: "Talla 8",
  sku: "ANI-950-08",
  imageUrl: "https://cdn.shopify.com/anillo.jpg",
  catalogPrice: "165.50",
  customization: "  Grabado: Ana  ",
  quantity: "2",
  unitPrice: "165.50",
  discountType: "",
  discountValue: "",
};

const libre: QuoteLineDraft = {
  ...freeLine(KEY_2),
  title: "Bandeja grabada",
  unitPrice: "1,200.00",
  discountType: "monto",
  discountValue: "100",
};

const input = (patch: Partial<QuoteFormInput> = {}): QuoteFormInput => ({
  clientId: CLIENT,
  contactId: null,
  validityDays: "15",
  notes: "",
  terms: "",
  lines: [anillo, libre],
  ...patch,
});

describe("quoteSchema", () => {
  it("acepta una cotización válida y convierte los montos a céntimos", () => {
    const parsed = quoteSchema.parse(input());
    expect(parsed.validityDays).toBe(15);
    expect(parsed.lines[0]).toMatchObject({
      id: KEY_1,
      customization: "Grabado: Ana",
      quantity: 2,
      unit_price: 16550,
      catalog_price: 16550,
      discount_type: null,
      discount_value: 0,
    });
    expect(parsed.lines[1]).toMatchObject({
      shopify_product_id: null,
      unit_price: 120000,
      discount_type: "monto",
      discount_value: 10000,
    });
  });

  it("exige al menos una línea", () => {
    expect(quoteFormErrors(input({ lines: [] }))).toEqual({
      lines: "Agrega al menos un producto",
      byLine: {},
    });
  });

  it("exige un cliente", () => {
    expect(quoteFormErrors(input({ clientId: "" }))?.clientId).toBe(
      "Elige un cliente",
    );
  });

  it.each(["0", "-1", "1.5", "", "100001", "abc"])(
    "rechaza la cantidad %j",
    (quantity) => {
      expect(
        quoteFormErrors(input({ lines: [{ ...anillo, quantity }] }))?.byLine[
          KEY_1
        ]?.quantity,
      ).toBe("La cantidad debe ser un entero mayor que 0 (hasta 100 000)");
    },
  );

  it("acepta precio 0 y rechaza precios negativos o vacíos", () => {
    expect(
      quoteFormErrors(input({ lines: [{ ...anillo, unitPrice: "0" }] })),
    ).toBeNull();
    expect(
      quoteFormErrors(input({ lines: [{ ...anillo, unitPrice: "-5" }] }))
        ?.byLine[KEY_1]?.unitPrice,
    ).toBe("Ingresa un precio válido (0 o más, hasta 2 decimales)");
    expect(
      quoteFormErrors(input({ lines: [{ ...anillo, unitPrice: " " }] }))
        ?.byLine[KEY_1]?.unitPrice,
    ).toBe("Ingresa el precio");
  });

  it("una línea libre necesita la descripción del producto", () => {
    expect(
      quoteFormErrors(input({ lines: [{ ...libre, title: "  " }] }))?.byLine[
        KEY_2
      ]?.title,
    ).toBe("Describe el producto");
  });

  it("el descuento no supera el subtotal ni el 100 %", () => {
    expect(
      quoteFormErrors(
        input({ lines: [{ ...libre, discountValue: "1200.01" }] }),
      )?.byLine[KEY_2]?.discountValue,
    ).toBe("El descuento no puede ser mayor que el subtotal de la línea");
    expect(
      quoteFormErrors(
        input({
          lines: [
            { ...libre, discountType: "porcentaje", discountValue: "101" },
          ],
        }),
      )?.byLine[KEY_2]?.discountValue,
    ).toBe("Ingresa un porcentaje de 0 a 100");
  });

  it.each(["0", "366", "", "1.5"])("rechaza la vigencia %j", (validityDays) => {
    expect(quoteFormErrors(input({ validityDays }))?.validityDays).toBe(
      "La vigencia debe ser de 1 a 365 días",
    );
  });
});

describe("quoteRpcArgs", () => {
  it("arma los datos de save_quote con montos en soles", () => {
    const args = quoteRpcArgs(
      quoteSchema.parse(
        input({
          lines: [
            anillo,
            { ...libre, discountType: "porcentaje", discountValue: "12.5" },
          ],
        }),
      ),
    );
    expect(args.p_quote).toEqual({
      client_id: CLIENT,
      contact_id: null,
      validity_days: 15,
      notes: "",
      terms: "",
    });
    expect(args.p_items[0]).toMatchObject({
      unit_price: "165.50",
      catalog_price: "165.50",
      discount_value: "0",
    });
    expect(args.p_items[1]).toMatchObject({
      unit_price: "1200.00",
      catalog_price: null,
      discount_type: "porcentaje",
      discount_value: "12.5",
    });
  });
});
