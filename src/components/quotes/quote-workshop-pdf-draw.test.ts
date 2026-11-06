import { describe, expect, it } from "vitest";

import { quoteWorkshopPdfModel } from "@/domain/quote-workshop-pdf";

import { drawQuoteWorkshopPdf } from "./quote-workshop-pdf-draw";

const line = (id: string, customization = "Grabado: Promo 2026") => ({
  id,
  title: "Anillo de graduación",
  variantTitle: "Plata 950 / Talla 8",
  sku: "ANI-1",
  customization,
  quantity: 2,
  image: null,
});

describe("drawQuoteWorkshopPdf", () => {
  it("dibuja la orden con la cotización, sus productos e instrucciones, sin precios", async () => {
    const model = quoteWorkshopPdfModel(
      [
        {
          id: "q1",
          code: "COT-000124",
          status: "aceptada",
          clientName: "Ana Torres",
          issueDate: "2026-10-28",
          supplierDeliveryDate: "2026-11-18",
          deliveryDate: "2026-11-20",
          notes: "Estuche azul",
          lines: [line("a"), line("b", "")],
        },
      ],
      "2026-11-06",
    );
    const pdf = await drawQuoteWorkshopPdf(model);
    const text = pdf.output();
    for (const expected of [
      "ORDEN PARA TALLER",
      "COT-000124  ·  Ana Torres",
      "Entrega taller: 18/11/2026",
      "PERSONALIZACI",
      "Grabado: Promo 2026",
      "Sin personalizaci",
      "INSTRUCCIONES PARA TALLER",
      "Estuche azul",
    ]) {
      expect(text).toContain(expected);
    }
    expect(text).not.toContain("S/");
    expect(pdf.getNumberOfPages()).toBe(1);
  });

  it("pasa a otra página cuando no caben los productos y repite el encabezado", async () => {
    const model = quoteWorkshopPdfModel(
      [
        {
          id: "q1",
          code: "COT-000200",
          status: "emitida",
          clientName: "",
          issueDate: null,
          supplierDeliveryDate: null,
          deliveryDate: null,
          notes: "",
          lines: Array.from({ length: 9 }, (_, i) => line(String(i))),
        },
      ],
      "2026-11-06",
    );
    const pdf = await drawQuoteWorkshopPdf(model);
    expect(pdf.getNumberOfPages()).toBeGreaterThan(1);
    expect(pdf.output()).toContain("continuaci");
  });
});
