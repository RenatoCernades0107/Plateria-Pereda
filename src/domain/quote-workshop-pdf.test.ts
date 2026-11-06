import { describe, expect, it } from "vitest";

import {
  quoteWorkshopPdfFileName,
  quoteWorkshopPdfModel,
  type WorkshopQuote,
} from "./quote-workshop-pdf";

const quote: WorkshopQuote = {
  id: "q1",
  code: "COT-000124",
  status: "aceptada",
  clientName: " Ana Torres ",
  issueDate: "2026-10-28",
  supplierDeliveryDate: "2026-11-18",
  deliveryDate: "2026-11-20",
  notes: " Estuche azul ",
  lines: [
    {
      id: "a",
      title: "Anillo",
      variantTitle: "Plata 950 / Talla 8",
      sku: "ANI-1",
      customization: " Grabado ",
      quantity: 25,
      image: null,
    },
    {
      id: "b",
      title: "Dije",
      variantTitle: "",
      sku: null,
      customization: "",
      quantity: 1,
      image: null,
    },
  ],
};

describe("quoteWorkshopPdfModel", () => {
  it("arma la orden sin precios, con totales de unidades y fechas", () => {
    const model = quoteWorkshopPdfModel([quote], "2026-11-06");
    expect(model.meta).toEqual([
      ["Fecha", "06/11/2026"],
      ["Cotizaciones", "1"],
      ["Unidades", "26"],
    ]);
    const [section] = model.sections;
    expect(section!.clientName).toBe("Ana Torres");
    expect(section!.deadline).toBe("Entrega taller: 18/11/2026");
    expect(section!.info).toEqual([
      ["Estado", "Aceptada"],
      ["Emitida", "28/10/2026"],
      ["Entrega al cliente", "20/11/2026"],
      ["Productos", "2 (26 unidades)"],
    ]);
    expect(section!.rows[0]).toMatchObject({
      number: 1,
      sku: "ANI-1",
      quantity: "25",
      customization: "Grabado",
    });
    expect(section!.rows[1]!.sku).toBe("—");
    expect(section!.notes).toBe("Estuche azul");
  });

  it("omite las fechas que no se fijaron", () => {
    const model = quoteWorkshopPdfModel(
      [
        {
          ...quote,
          issueDate: null,
          supplierDeliveryDate: null,
          deliveryDate: null,
          lines: [{ ...quote.lines[1]! }],
        },
      ],
      "2026-11-06",
    );
    expect(model.sections[0]!.deadline).toBeNull();
    expect(model.sections[0]!.info).toEqual([
      ["Estado", "Aceptada"],
      ["Productos", "1 (1 unidad)"],
    ]);
  });
});

describe("quoteWorkshopPdfFileName", () => {
  it("usa el código con una sola cotización y la fecha con varias", () => {
    expect(quoteWorkshopPdfFileName(["COT-000124"], "2026-11-06")).toBe(
      "taller-COT-000124.pdf",
    );
    expect(quoteWorkshopPdfFileName(["A", "B"], "2026-11-06")).toBe(
      "taller-cotizaciones-2026-11-06.pdf",
    );
  });
});
