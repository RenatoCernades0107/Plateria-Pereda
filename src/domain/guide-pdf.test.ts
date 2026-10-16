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
  attendedBy: "María Quispe",
  notes: "  Entregar en caja  ",
  pieces: [
    piece("1"),
    piece("2", { priceCents: null }),
    piece("3", { status: "anulada" }),
  ],
  money: { totalCents: 10000, paidCents: 4000 },
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
    expect(model.meta.map(([label]) => label)).toEqual(["Fecha", "Guía N°"]);
    expect(model.guide).toContainEqual(["Atendió", "María Quispe"]);
    expect(model.clause).toContain("30 días calendario");
    // Membrete fijo de la oficina principal (no depende de Configuración).
    expect(model.companyLines).toEqual([
      { text: "OFICINA PRINCIPAL MIRAFLORES:" },
      { text: "Calle Coronel Inclán 928, Miraflores, Lima - Lima" },
      { text: "995 711 235", icon: "whatsapp" },
      { text: "Pereda.Plateria.Joyeria", icon: "facebook" },
      { text: "www.plateriapereda.com", icon: "web" },
    ]);
    expect(model.footer).toContain("01 444 5555 · ventas@pereda.pe");
  });

  it("muestra el subtotal de las piezas con precio y cuántas faltan por cotizar", () => {
    const all = guidePdfModel(data, new Set(["1", "2", "3"]));
    expect(all.rows[2]!.price).toBe("No se cobra");
    expect(all.totals).toEqual([
      { label: "Subtotal", value: "S/ 100.00", strong: true },
    ]);
    expect(all.totalsNote).toBe("Falta 1 pieza por cotizar.");

    const some = guidePdfModel(data, new Set(["1"]));
    expect(some.totalsNote).toBeNull();
  });

  it("con todas las piezas con precio dice «Total», no «Subtotal»", () => {
    const model = guidePdfModel(data, new Set(["1"]));
    expect(model.totals).toEqual([
      { label: "Total", value: "S/ 100.00", strong: true },
    ]);
    // Las piezas que no se cobran no cuentan: solo falta cotizar las que se cobran.
    const withClosed = guidePdfModel(data, new Set(["1", "3"]));
    expect(withClosed.totals).toEqual([
      { label: "Total", value: "S/ 100.00", strong: true },
    ]);
    expect(withClosed.totalsNote).toBeNull();
  });

  it("sin ninguna pieza con precio, el subtotal sale por definir", () => {
    const model = guidePdfModel(data, new Set(["2"]));
    expect(model.totals).toEqual([
      { label: "Subtotal", value: "Por definir", strong: true },
    ]);
    expect(model.totalsNote).toBeNull();
  });

  it("para taller quita cliente, precios, cláusula y firmas", () => {
    const model = guidePdfModel(data, new Set(["1", "2"]), {
      forWorkshop: true,
    });
    expect(model.client).toEqual([]);
    expect(model.showPrice).toBe(false);
    expect(model.rows.every((r) => r.price === null)).toBe(true);
    expect(model.totals).toEqual([]);
    expect(model.clause).toBeNull();
    expect(model.signer).toBeNull();
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
