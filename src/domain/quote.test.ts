import { describe, expect, it } from "vitest";

import {
  addDays,
  canChangeQuoteStatus,
  formatQuoteDate,
  formatQuoteDateLong,
  isQuoteExpired,
  limaDateOf,
  lineDiscount,
  lineGross,
  lineTotal,
  nextQuoteStatuses,
  QUOTE_STATUSES,
  quoteDisplayStatus,
  quoteTotals,
  quoteValidUntil,
} from "./quote";

describe("líneas de la cotización", () => {
  it("subtotal = cantidad × precio, en céntimos exactos", () => {
    expect(lineGross({ quantity: 3, unitPrice: 33_33 })).toBe(99_99);
    // 0.1 + 0.2 en soles no arrastra errores: se trabaja en céntimos.
    expect(lineGross({ quantity: 3, unitPrice: 10 })).toBe(30);
  });

  it("cantidad grande y precio alto sin perder céntimos", () => {
    expect(lineGross({ quantity: 100_000, unitPrice: 99_999_999_99 })).toBe(
      999_999_999_900_000,
    );
    expect(Number.isSafeInteger(999_999_999_900_000)).toBe(true);
  });

  it("precio 0 deja la línea en 0", () => {
    const line = { quantity: 5, unitPrice: 0 };
    expect(lineTotal(line)).toBe(0);
    expect(
      lineDiscount({ ...line, discount: { type: "porcentaje", percent: 50 } }),
    ).toBe(0);
  });

  it("descuento en % redondeado a céntimos (como la BD)", () => {
    const line = { quantity: 3, unitPrice: 33_33 };
    expect(
      lineDiscount({ ...line, discount: { type: "porcentaje", percent: 10 } }),
    ).toBe(10_00); // 9.999 → 10.00
    expect(
      lineTotal({ ...line, discount: { type: "porcentaje", percent: 12.5 } }),
    ).toBe(87_49); // 99.99 − 12.50 (12.49875 → 12.50)
  });

  it("descuento en monto, nunca mayor que el subtotal", () => {
    const line = { quantity: 1, unitPrice: 10_00 };
    expect(
      lineTotal({ ...line, discount: { type: "monto", cents: 2_50 } }),
    ).toBe(7_50);
    expect(
      lineDiscount({ ...line, discount: { type: "monto", cents: 20_00 } }),
    ).toBe(10_00);
    expect(
      lineDiscount({ ...line, discount: { type: "porcentaje", percent: 150 } }),
    ).toBe(10_00);
  });

  it("sin descuento", () => {
    expect(lineDiscount({ quantity: 2, unitPrice: 5_00, discount: null })).toBe(
      0,
    );
  });
});

describe("quoteTotals", () => {
  const lines = [
    { quantity: 2, unitPrice: 120_10 },
    {
      quantity: 3,
      unitPrice: 33_33,
      discount: { type: "porcentaje", percent: 10 },
    },
  ] as const;

  describe("precios sin IGV (cotizaciones anteriores: no cambian)", () => {
    it("sin IGV: total = subtotal − descuentos", () => {
      expect(quoteTotals(lines, false, false)).toEqual({
        subtotal: 340_19,
        discount: 10_00,
        base: 330_19,
        igv: 0,
        total: 330_19,
      });
    });

    it("con IGV: 18 % de subtotal − descuentos, redondeado una sola vez", () => {
      // 330.19 × 18 % = 59.4342 → 59.43.
      expect(quoteTotals(lines, true, false)).toEqual({
        subtotal: 340_19,
        discount: 10_00,
        base: 330_19,
        igv: 59_43,
        total: 389_62,
      });
    });

    it("el IGV va sobre el total con descuentos, no línea por línea", () => {
      // Por línea: 0.03 × 18 % = 0.0054 → 0.01 cada una (0.03 en total); sobre el
      // total: 0.09 × 18 % = 0.0162 → 0.02.
      const small = [1, 2, 3].map(() => ({ quantity: 1, unitPrice: 3 }));
      expect(quoteTotals(small, true, false)).toMatchObject({
        igv: 2,
        total: 11,
      });
    });

    it("redondea el medio céntimo lejos del cero, como la BD", () => {
      // 0.25 × 18 % = 0.045 → 0.05.
      expect(
        quoteTotals([{ quantity: 1, unitPrice: 25 }], true, false),
      ).toMatchObject({ igv: 5, total: 30 });
    });

    it("sin líneas todo es 0", () => {
      const zero = { subtotal: 0, discount: 0, base: 0, igv: 0, total: 0 };
      expect(quoteTotals([], true, false)).toEqual(zero);
      expect(quoteTotals([], false, false)).toEqual(zero);
    });
  });

  describe("precios con IGV incluido (cotizaciones nuevas)", () => {
    it("el total es lo que suman los precios menos descuentos; el IGV es un desglose", () => {
      // Total 330.19 (240.20 + 99.99 − 10.00). Base = 330.19 ÷ 1.18 = 279.82 (279.8220…),
      // IGV = 330.19 − 279.82 = 50.37. Subtotal sin IGV = 340.19 ÷ 1.18 = 288.30.
      expect(quoteTotals(lines, true, true)).toEqual({
        subtotal: 288_30,
        discount: 8_48,
        base: 279_82,
        igv: 50_37,
        total: 330_19,
      });
    });

    it("siempre cuadra: subtotal − descuentos = base y base + IGV = total", () => {
      for (const unitPrice of [1, 3, 25, 99, 118, 1_00, 33_33, 120_10, 9_999]) {
        for (const quantity of [1, 2, 7]) {
          const t = quoteTotals(
            [
              {
                quantity,
                unitPrice,
                discount: { type: "porcentaje", percent: 12.5 },
              },
            ],
            true,
            true,
          );
          expect(t.subtotal - t.discount).toBe(t.base);
          expect(t.base + t.igv).toBe(t.total);
          expect(t.total).toBe(
            quantity * unitPrice -
              Math.min(
                quantity * unitPrice,
                Math.round((quantity * unitPrice * 12.5) / 100),
              ),
          );
        }
      }
    });

    it("S/ 118.00 incluye S/ 18.00 de IGV", () => {
      expect(
        quoteTotals([{ quantity: 1, unitPrice: 118_00 }], true, true),
      ).toEqual({
        subtotal: 100_00,
        discount: 0,
        base: 100_00,
        igv: 18_00,
        total: 118_00,
      });
    });

    it("un solo redondeo: base = total ÷ 1.18 (medios céntimos hacia arriba)", () => {
      // 3 céntimos ÷ 1.18 = 2.54 céntimos → 3; IGV 0.
      expect(
        quoteTotals([{ quantity: 1, unitPrice: 3 }], true, true),
      ).toMatchObject({ base: 3, igv: 0, total: 3 });
      // 0.09 en tres líneas de 0.03: la base sale del total (9 ÷ 1.18 = 7.63 → 8), no línea por línea.
      const small = [1, 2, 3].map(() => ({ quantity: 1, unitPrice: 3 }));
      expect(quoteTotals(small, true, true)).toMatchObject({
        base: 8,
        igv: 1,
        total: 9,
      });
    });

    it("sin IGV (casilla desmarcada) no hay desglose aunque el flag diga incluido", () => {
      expect(quoteTotals(lines, false, true)).toEqual({
        subtotal: 340_19,
        discount: 10_00,
        base: 330_19,
        igv: 0,
        total: 330_19,
      });
    });

    it("sin líneas todo es 0", () => {
      expect(quoteTotals([], true, true)).toEqual({
        subtotal: 0,
        discount: 0,
        base: 0,
        igv: 0,
        total: 0,
      });
    });
  });
});

describe("vigencia en Lima", () => {
  it("la fecha calendario es la de Lima, no la UTC", () => {
    // 04:59 UTC del 1 de noviembre = 23:59 del 31 de octubre en Lima (UTC−5).
    expect(limaDateOf(new Date("2026-11-01T04:59:00Z"))).toBe("2026-10-31");
    expect(limaDateOf(new Date("2026-11-01T05:00:00Z"))).toBe("2026-11-01");
  });

  it("emisión + días cruza fin de mes y de año", () => {
    expect(quoteValidUntil("2026-10-20", 15)).toBe("2026-11-04");
    expect(quoteValidUntil("2026-12-25", 15)).toBe("2027-01-09");
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
  });

  it("respeta los años bisiestos", () => {
    expect(quoteValidUntil("2028-02-20", 9)).toBe("2028-02-29");
    expect(quoteValidUntil("2027-02-20", 9)).toBe("2027-03-01");
  });

  it("rechaza fechas mal formadas", () => {
    expect(() => addDays("04/10/2026", 1)).toThrow(/Fecha inválida/);
  });
});

describe("cotización vencida", () => {
  const validUntil = "2026-10-31";

  it("vigente hasta el último día inclusive (hora de Lima)", () => {
    expect(isQuoteExpired(validUntil, new Date("2026-11-01T04:59:00Z"))).toBe(
      false,
    );
    expect(isQuoteExpired(validUntil, new Date("2026-11-01T05:00:00Z"))).toBe(
      true,
    );
  });

  it("un borrador (sin vigencia) nunca vence", () => {
    expect(isQuoteExpired(null, new Date("2030-01-01T00:00:00Z"))).toBe(false);
  });

  it("solo una emitida se muestra como vencida", () => {
    const later = new Date("2026-12-01T12:00:00Z");
    expect(quoteDisplayStatus("emitida", validUntil, later)).toBe("vencida");
    expect(quoteDisplayStatus("aceptada", validUntil, later)).toBe("aceptada");
    expect(quoteDisplayStatus("rechazada", validUntil, later)).toBe(
      "rechazada",
    );
    expect(quoteDisplayStatus("borrador", null, later)).toBe("borrador");
    expect(
      quoteDisplayStatus("emitida", validUntil, new Date("2026-10-15")),
    ).toBe("emitida");
  });
});

describe("cambios de estado", () => {
  it("siguen la tabla de la BD", () => {
    const allowed = QUOTE_STATUSES.flatMap((from) =>
      QUOTE_STATUSES.filter((to) => canChangeQuoteStatus(from, to)).map(
        (to) => `${from}→${to}`,
      ),
    );
    expect(allowed).toEqual([
      "borrador→emitida",
      "emitida→aceptada",
      "emitida→rechazada",
      "emitida→anulada",
      "aceptada→emitida",
      "aceptada→facturada",
      "aceptada→anulada",
      "rechazada→emitida",
      "rechazada→anulada",
    ]);
    expect(nextQuoteStatuses("anulada")).toEqual([]);
    expect(nextQuoteStatuses("reembolsada")).toEqual([]);
    expect(nextQuoteStatuses("borrador")).toEqual(["emitida"]);
  });
});

describe("formatQuoteDate", () => {
  it("muestra la fecha calendario sin correrla por la zona horaria", () => {
    expect(formatQuoteDate("2026-10-04")).toBe("04/10/2026");
    expect(formatQuoteDate("2028-02-29")).toBe("29/02/2028");
  });
});

describe("formatQuoteDateLong", () => {
  it("en letras para el encabezado del PDF (Paso 14.5)", () => {
    expect(formatQuoteDateLong("2026-08-17")).toBe("17 de agosto de 2026");
    expect(formatQuoteDateLong("2028-02-29")).toBe("29 de febrero de 2028");
  });
});
