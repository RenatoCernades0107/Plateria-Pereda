import { describe, expect, it } from "vitest";

import { DEFAULT_WHATSAPP_TEMPLATE } from "./whatsapp-template";
import {
  buildQuoteMessage,
  quoteAmounts,
  whatsappUrl,
  type QuoteMessageData,
} from "./whatsapp-quote";

const data = (overrides: Partial<QuoteMessageData> = {}): QuoteMessageData => ({
  code: "RES-00001",
  clientName: "Ana Pérez",
  pieces: [
    {
      description: "Fuente de plata",
      service: "Pulido",
      priceCents: 120_050,
      status: "registrada",
    },
    {
      description: "Candelabro",
      service: null,
      priceCents: 35_000,
      status: "en_consulta",
    },
    {
      description: "Bandeja rota",
      service: "Soldadura",
      priceCents: 99_900,
      status: "anulada",
    },
  ],
  pricesIncludeIgv: true,
  paymentType: "a_cuenta",
  depositPercent: 50,
  terms: "La cotización vale 15 días.",
  ...overrides,
});

describe("mensaje de cotización", () => {
  it("al contado", () => {
    expect(
      buildQuoteMessage(
        DEFAULT_WHATSAPP_TEMPLATE,
        data({ paymentType: "contado" }),
      ),
    ).toMatchInlineSnapshot(`
      "Hola Ana Pérez, te saludamos de Platería Pereda.
      Te compartimos la cotización de tu restauración *RES-00001*:

      1. Fuente de plata – Pulido: S/ 1,200.50
      2. Candelabro: S/ 350.00

      *Total: S/ 1,550.50*
      Forma de pago: Al contado (S/ 1,550.50)
      La cotización vale 15 días."
    `);
  });

  it("a cuenta", () => {
    expect(
      buildQuoteMessage(
        DEFAULT_WHATSAPP_TEMPLATE,
        data({ depositPercent: 33.5 }),
      ),
    ).toMatchInlineSnapshot(`
      "Hola Ana Pérez, te saludamos de Platería Pereda.
      Te compartimos la cotización de tu restauración *RES-00001*:

      1. Fuente de plata – Pulido: S/ 1,200.50
      2. Candelabro: S/ 350.00

      *Total: S/ 1,550.50*
      Forma de pago: A cuenta (adelanto del 33.5 %: S/ 519.42)
      La cotización vale 15 días."
    `);
  });

  it("al crédito, saludando al contacto y sin condiciones", () => {
    expect(
      buildQuoteMessage(
        DEFAULT_WHATSAPP_TEMPLATE,
        data({ paymentType: "credito", contactName: "Luis Gómez", terms: "" }),
      ),
    ).toMatchInlineSnapshot(`
      "Hola Luis Gómez, te saludamos de Platería Pereda.
      Te compartimos la cotización de tu restauración *RES-00001*:

      1. Fuente de plata – Pulido: S/ 1,200.50
      2. Candelabro: S/ 350.00

      *Total: S/ 1,550.50*
      Forma de pago: Al crédito (sin adelanto)"
    `);
  });

  it("excluye las piezas anuladas de la lista y del total", () => {
    const message = buildQuoteMessage(DEFAULT_WHATSAPP_TEMPLATE, data());
    expect(message).not.toContain("Bandeja rota");
    expect(message).toContain("*Total: S/ 1,550.50*");
    expect(quoteAmounts(data())).toMatchObject({
      totalCents: 155_050,
      depositCents: 77_525,
    });
  });

  it("sin IGV incluido suma el 18 % por pieza y muestra el desglose (P13)", () => {
    const sinIgv = data({ pricesIncludeIgv: false, paymentType: "contado" });
    // 1,200.50 → 1,416.59 y 350.00 → 413.00
    expect(quoteAmounts(sinIgv)).toEqual({
      totalCents: 182_959,
      taxableBaseCents: 155_050,
      igvCents: 27_909,
      depositCents: 182_959,
    });
    expect(buildQuoteMessage(DEFAULT_WHATSAPP_TEMPLATE, sinIgv))
      .toMatchInlineSnapshot(`
      "Hola Ana Pérez, te saludamos de Platería Pereda.
      Te compartimos la cotización de tu restauración *RES-00001*:

      1. Fuente de plata – Pulido: S/ 1,200.50
      2. Candelabro: S/ 350.00

      Subtotal (sin IGV): S/ 1,550.50
      IGV (18 %): S/ 279.09

      *Total: S/ 1,829.59*
      Forma de pago: Al contado (S/ 1,829.59)
      La cotización vale 15 días."
    `);
  });

  it("usa soles con separador de miles y una línea por pieza", () => {
    const message = buildQuoteMessage(
      "{piezas}\nTotal: S/ {total} | {tipo_pago} | {porcentaje_adelanto} % = S/ {adelanto}",
      data({ pieces: [{ ...data().pieces[0]!, priceCents: 5 }] }),
    );
    expect(message).toBe(
      "1. Fuente de plata – Pulido: S/ 0.05\nTotal: S/ 0.05 | A cuenta | 50 % = S/ 0.03",
    );
  });

  it("excluye también las piezas rechazadas y sin arreglo (P47)", () => {
    const message = buildQuoteMessage(
      "{piezas}|{total}",
      data({
        pieces: [
          { ...data().pieces[0]!, status: "rechazada" },
          { ...data().pieces[1]!, status: "sin_arreglo" },
          { ...data().pieces[0]!, description: "Copa", status: "aprobada" },
        ],
      }),
    );
    expect(message).toBe("1. Copa – Pulido: S/ 1,200.50|1,200.50");
  });

  it("cotización de WhatsApp sin nombre: saludo genérico y código CWA (P46)", () => {
    const message = buildQuoteMessage(
      DEFAULT_WHATSAPP_TEMPLATE,
      data({ code: "CWA-00007", clientName: "" }),
    );
    expect(message.startsWith("Hola, te saludamos de Platería Pereda.")).toBe(
      true,
    );
    expect(message).toContain("*CWA-00007*");
  });

  it("al crédito el adelanto es 0", () => {
    expect(
      buildQuoteMessage(
        "{porcentaje_adelanto} % S/ {adelanto}",
        data({ paymentType: "credito" }),
      ),
    ).toBe("0 % S/ 0.00");
  });
});

describe("whatsappUrl", () => {
  it("normaliza el número y codifica el texto", () => {
    expect(
      whatsappUrl("999 888 777", "Hola *Ana* & co.\nTotal: S/ 1,550.50"),
    ).toBe(
      "https://wa.me/51999888777?text=Hola%20*Ana*%20%26%20co.%0ATotal%3A%20S%2F%201%2C550.50",
    );
    expect(whatsappUrl("+51 (999) 888-777", "x")).toBe(
      "https://wa.me/51999888777?text=x",
    );
    expect(whatsappUrl("+34 612 345 678", "x")).toBe(
      "https://wa.me/34612345678?text=x",
    );
  });

  it("sin teléfono válido devuelve null", () => {
    expect(whatsappUrl(null, "x")).toBeNull();
    expect(whatsappUrl(undefined, "x")).toBeNull();
    expect(whatsappUrl("", "x")).toBeNull();
    expect(whatsappUrl("123", "x")).toBeNull();
  });
});
