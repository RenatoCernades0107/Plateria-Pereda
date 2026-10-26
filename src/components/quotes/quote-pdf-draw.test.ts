import { describe, expect, it } from "vitest";

import { quotePdfModel, type QuotePdfData } from "@/domain/quote-pdf";

import { drawQuotePdf } from "./quote-pdf-draw";

const data: QuotePdfData = {
  company: {
    name: "Platería Pereda",
    address: "Calle Coronel Inclán 928, Miraflores",
  },
  code: "COT-000001",
  issueDate: "2026-08-17",
  validityDays: 7,
  clientName: "Lorena Rodríguez di Laura",
  contactName: "Lorena Rodríguez di Laura",
  lines: [
    {
      sku: "TNS01",
      description: "Escultura en madera tallada a mano",
      quantity: 1,
      unitPrice: 1_906_78,
    },
  ],
  notes: "",
  terms: "",
};

describe("drawQuotePdf", () => {
  it("dibuja el encabezado, el cliente y la dirección de la empresa", async () => {
    const raw = (await drawQuotePdf(quotePdfModel(data))).output();
    for (const text of [
      "Miraflores, 17 de agosto de 2026",
      "Cotización N°:",
      "COT-000001",
      "Lorena Rodríguez di Laura",
      "Calle Coronel Inclán 928, Miraflores",
    ])
      expect(raw).toContain(`(${text})`);
    // jsPDF escapa los paréntesis del contenido (son delimitadores en el PDF).
    expect(raw).toContain("(Sr\\(es\\):)");
  });

  it("la tabla lleva SKU, descripción, cantidad y precios", async () => {
    const raw = (await drawQuotePdf(quotePdfModel(data))).output();
    for (const text of [
      "SKU",
      "Descripción",
      "TNS01",
      "Escultura en madera tallada a mano",
      "S/ 1,906.78",
    ])
      expect(raw).toContain(`(${text})`);
  });

  it("totales, monto en letras y condiciones fijas", async () => {
    const raw = (await drawQuotePdf(quotePdfModel(data))).output();
    for (const text of [
      "Sub Total:",
      "Total Venta:",
      "Son:",
      "MIL NOVECIENTOS SEIS Y 78/100 SOLES",
      "Validez:",
      "Impuesto:",
      "LOS PRECIOS NO INCLUYEN IGV",
      "Atentamente,",
      "Platería Pereda",
    ])
      expect(raw).toContain(`(${text})`);
  });

  it("sin notas ni condiciones, no dibuja esas etiquetas", async () => {
    const raw = (await drawQuotePdf(quotePdfModel(data))).output();
    expect(raw).not.toContain("(Notas:)");
    expect(raw).not.toContain("(Condiciones:)");
  });

  it("con notas y condiciones, las muestra", async () => {
    const withText = quotePdfModel({
      ...data,
      notes: "Entrega en 10 días hábiles.",
      terms: "Condición: Al contado",
    });
    const raw = (await drawQuotePdf(withText)).output();
    expect(raw).toContain("(Notas:)");
    expect(raw).toContain("(Entrega en 10 días hábiles.)");
    expect(raw).toContain("(Condiciones:)");
    expect(raw).toContain("(Condición: Al contado)");
  });

  it("con descuento, muestra la fila de descuento", async () => {
    const withDiscount = quotePdfModel({
      ...data,
      lines: [
        { ...data.lines[0]!, discount: { type: "porcentaje", percent: 10 } },
      ],
    });
    const raw = (await drawQuotePdf(withDiscount)).output();
    expect(raw).toContain("(Descuento:)");
  });

  it("con logo, agrega la imagen (sin romper el resto del contenido)", async () => {
    // GIF/JPEG mínimo no hace falta: un PNG 1x1 transparente basta para jsPDF.
    const logo =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    const raw = (await drawQuotePdf(quotePdfModel(data), { logo })).output();
    expect(raw.match(/\/Subtype \/Image/g)).toHaveLength(1);
    expect(raw).toContain("(COT-000001)");
  });
});
