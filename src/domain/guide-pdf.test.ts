import { describe, expect, it } from "vitest";

import {
  guidePdfFileName,
  guidePdfModel,
  type GuidePdfData,
} from "./guide-pdf";

const piece = (
  id: string,
  over: Partial<GuidePdfData["pieces"][number]> = {},
): GuidePdfData["pieces"][number] => ({
  id,
  code: `RES-00012-${id}`,
  description: `Pieza ${id}`,
  materialName: "Plata 950",
  serviceName: "Limpieza",
  measure: "",
  weightGrams: 120,
  status: "aprobada",
  notes: "",
  priceCents: 10000,
  ...over,
});

const data: GuidePdfData = {
  company: {
    name: "Platería Pereda",
    ruc: "20100047218",
    address: "Av. Larco 123, Miraflores",
    phones: "01 444 5555",
    email: "ventas@pereda.pe",
  },
  code: "RES-00012",
  createdAt: "2026-10-01T15:00:00Z",
  status: "aprobada",
  paymentType: "a_cuenta",
  clientName: "Ana Torres",
  contactName: null,
  phone: "+51 999 888 777",
  shopifyOrderName: null,
  notes: "  Entregar en caja  ",
  pieces: [
    piece("1"),
    piece("2", { priceCents: null }),
    piece("3", { status: "anulada" }),
  ],
  money: { pricesIncludeIgv: true, totalCents: 10000, paidCents: 4000 },
};

describe("guidePdfModel", () => {
  it("incluye solo las piezas elegidas, con detalle y precio", () => {
    const model = guidePdfModel(data, new Set(["1", "2"]));
    expect(model.title).toBe("GUÍA DE RESTAURACIÓN");
    expect(model.meta).toContainEqual(["Guía N°", "RES-00012"]);
    expect(model.rows.map((r) => [r.id, r.number])).toEqual([
      ["1", 1],
      ["2", 2],
    ]);
    expect(model.rows[0]!.detail).toBe("Plata 950 · 120 g");
    expect(model.rows[0]!.service).toBe("Limpieza");
    expect(model.rows[1]!.price).toBe("Por definir");
    expect(model.notes).toBe("Entregar en caja");
    expect(model.client).toEqual(["Ana Torres", "Teléfono: +51 999 888 777"]);
    expect(model.guide).toContainEqual(["Piezas", "2 de 3"]);
    expect(model.companyLines).toEqual([
      "Platería Pereda",
      "RUC 20100047218",
      "Av. Larco 123, Miraflores",
      "Teléfono: 01 444 5555",
      "ventas@pereda.pe",
    ]);
    expect(model.footer).toContain("01 444 5555 · ventas@pereda.pe");
  });

  it("totaliza sin las piezas cerradas y muestra a cuenta y saldo solo con todas", () => {
    const all = guidePdfModel(data, new Set(["1", "2", "3"]));
    expect(all.rows[2]!.price).toBe("No se cobra");
    expect(all.totals).toContainEqual({
      label: "Total",
      value: "S/ 100.00",
      strong: true,
    });
    expect(all.totals).toContainEqual({
      label: "Saldo",
      value: "S/ 60.00",
      strong: true,
    });
    expect(all.totalsNote).toBe("Hay piezas sin precio (por definir).");

    const some = guidePdfModel(data, new Set(["1"]));
    expect(some.totals.map((t) => t.label)).toEqual([
      "Op. gravada",
      "IGV (18 %)",
      "Total",
    ]);
    expect(some.totalsNote).toBeNull();
  });

  it("sin montos (logística) no muestra precios ni totales", () => {
    const model = guidePdfModel(
      {
        ...data,
        money: null,
        pieces: data.pieces.map((p) => ({ ...p, priceCents: null })),
      },
      new Set(["1"]),
    );
    expect(model.showPrice).toBe(false);
    expect(model.rows[0]!.price).toBeNull();
    expect(model.totals).toEqual([]);
    expect(model.guide.map(([label]) => label)).not.toContain("Precios");
  });
});

describe("guidePdfFileName", () => {
  it("usa el código de la guía", () => {
    expect(guidePdfFileName("RES-00012")).toBe("guia-RES-00012.pdf");
  });
});
