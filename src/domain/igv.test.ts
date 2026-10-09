import { describe, expect, it } from "vitest";

import { igvBreakdown, igvLabel, igvTotals, priceWithIgv } from "./igv";

describe("IGV (P13)", () => {
  it("con IGV incluido el precio no cambia", () => {
    expect(priceWithIgv(100_00, true)).toBe(100_00);
  });

  it("sin IGV suma el 18 % redondeado a céntimos", () => {
    expect(priceWithIgv(100_00, false)).toBe(118_00);
    // 0.18 × 33.33 = 5.9994 → 6.00
    expect(priceWithIgv(33_33, false)).toBe(39_33);
    // 0.18 × 0.25 = 0.045 → 0.05 (empate lejos del cero, como round() de la BD)
    expect(priceWithIgv(25, false)).toBe(30);
    expect(priceWithIgv(0, false)).toBe(0);
  });

  it("total con IGV incluido: el desglose solo se informa", () => {
    expect(igvTotals([100_00, 18_00], true)).toEqual({
      total: 118_00,
      taxableBase: 100_00,
      igv: 18_00,
    });
  });

  it("total sin IGV: suma pieza por pieza, igual que las líneas de Shopify", () => {
    // 33.33 + 33.33 + 33.34 = 100.00 → 39.33 + 39.33 + 39.34 = 118.00
    expect(igvTotals([33_33, 33_33, 33_34], false)).toEqual({
      total: 118_00,
      taxableBase: 100_00,
      igv: 18_00,
    });
    // 0.25 × 3: cada pieza se redondea (0.30 × 3), no el total (0.885 → 0.89).
    expect(igvTotals([25, 25, 25], false)).toEqual({
      total: 90,
      taxableBase: 75,
      igv: 15,
    });
  });

  it("sin piezas el total es 0", () => {
    expect(igvTotals([], false)).toEqual({ total: 0, taxableBase: 0, igv: 0 });
  });

  it("el desglose siempre suma el total", () => {
    for (const total of [1, 99, 118_00, 333_33]) {
      const { taxableBase, igv } = igvBreakdown(total);
      expect(taxableBase + igv).toBe(total);
    }
  });

  it("etiqueta corta", () => {
    expect(igvLabel(true)).toBe("Incluye IGV");
    expect(igvLabel(false)).toBe("+ IGV (18 %)");
  });
});
