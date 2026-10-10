import { describe, expect, it } from "vitest";

import {
  addDays,
  canChangeQuoteStatus,
  formatQuoteDate,
  igvBreakdown,
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
  it("suma subtotales, descuentos y total con el desglose del IGV", () => {
    expect(
      quoteTotals([
        { quantity: 2, unitPrice: 120_10 },
        {
          quantity: 3,
          unitPrice: 33_33,
          discount: { type: "porcentaje", percent: 10 },
        },
      ]),
    ).toEqual({
      subtotal: 340_19,
      discount: 10_00,
      total: 330_19,
      taxableBase: 279_82,
      igv: 50_37,
    });
  });

  it("sin líneas todo es 0", () => {
    expect(quoteTotals([])).toEqual({
      subtotal: 0,
      discount: 0,
      total: 0,
      taxableBase: 0,
      igv: 0,
    });
  });

  it("sin IGV incluido suma el 18 % de cada línea con su descuento (P13)", () => {
    expect(
      quoteTotals(
        [
          { quantity: 2, unitPrice: 50_00 },
          {
            quantity: 1,
            unitPrice: 100_00,
            discount: { type: "porcentaje", percent: 10 },
          },
        ],
        false,
      ),
    ).toEqual({
      subtotal: 200_00,
      discount: 10_00,
      total: 224_20,
      taxableBase: 190_00,
      igv: 34_20,
    });
  });

  it("el desglose del IGV siempre suma el total", () => {
    for (const total of [1, 99, 118_00, 100_00, 333_33, 1_234_567_89]) {
      const { taxableBase, igv } = igvBreakdown(total);
      expect(taxableBase + igv).toBe(total);
    }
    expect(igvBreakdown(118_00)).toEqual({ taxableBase: 100_00, igv: 18_00 });
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
      "aceptada→emitida",
      "rechazada→emitida",
    ]);
    expect(nextQuoteStatuses("borrador")).toEqual(["emitida"]);
  });
});

describe("formatQuoteDate", () => {
  it("muestra la fecha calendario sin correrla por la zona horaria", () => {
    expect(formatQuoteDate("2026-10-04")).toBe("04/10/2026");
    expect(formatQuoteDate("2028-02-29")).toBe("29/02/2028");
  });
});
