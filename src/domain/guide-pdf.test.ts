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
  companyName: "Platería Pereda",
  code: "RES-00012",
  createdAt: "2026-10-01T15:00:00Z",
  status: "aprobada",
  paymentType: "a_cuenta",
  clientName: "Ana Torres",
  contactName: null,
  phone: "+51 999 888 777",
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
    expect(model.title).toBe("Guía RES-00012");
    expect(model.rows.map((r) => r.id)).toEqual(["1", "2"]);
    expect(model.rows[0]!.detail).toBe("Plata 950 · Limpieza · 120 g");
    expect(model.rows[1]!.price).toBe("Por definir");
    expect(model.notes).toBe("Entregar en caja");
    expect(model.info).toContainEqual(["Teléfono", "+51 999 888 777"]);
    expect(model.info.map(([label]) => label)).not.toContain("Contacto");
  });

  it("totaliza sin las piezas cerradas y muestra pagado y saldo solo con todas", () => {
    const all = guidePdfModel(data, new Set(["1", "2", "3"]));
    expect(all.totals).toContainEqual(["Total", "S/ 100.00"]);
    expect(all.rows[2]!.price).toBe("No se cobra");
    expect(all.totals).toContainEqual(["Saldo", "S/ 60.00"]);
    expect(all.totals).toContainEqual([
      "",
      "Hay piezas sin precio (por definir).",
    ]);

    const some = guidePdfModel(data, new Set(["1"]));
    expect(some.totals.map(([label]) => label)).toEqual([
      "Op. gravada",
      "IGV (18 %)",
      "Total",
    ]);
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
  });
});

describe("guidePdfFileName", () => {
  it("usa el código de la guía", () => {
    expect(guidePdfFileName("RES-00012")).toBe("guia-RES-00012.pdf");
  });
});
