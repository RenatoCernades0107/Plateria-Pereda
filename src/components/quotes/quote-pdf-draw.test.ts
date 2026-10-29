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
  paymentCondition: "contado",
  deliveryDays: 30,
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
      "Condición:",
      "Al contado",
      "Tiempo de entrega:",
      "30 días hábiles desde su aprobación",
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
    // Guion ASCII: el signo menos U+2212 no está en WinAnsi y salía como "  S / 1 9 0 . 6 8".
    expect(raw).toContain("(- S/ 190.68)");
    expect(raw).not.toContain("\u2212");
  });

  it("la dirección de la empresa va debajo del logo, alineada a la derecha", async () => {
    const logo =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    const pdf = await drawQuotePdf(quotePdfModel(data), { logo });
    const raw = pdf.output();
    // Envuelta al ancho del logo: "Calle Coronel Inclán 928," / "Miraflores".
    const match = /([\d.]+) ([\d.]+) Td\n\(Calle Coronel Incl/.exec(raw);
    expect(match).not.toBeNull();
    const pageH = pdf.internal.pageSize.getHeight();
    const k = 72 / 25.4;
    const x = Number(match![1]) / k;
    const y = pageH - Number(match![2]) / k;
    // Alineada a la derecha: termina en el margen derecho (210 - 18 mm).
    expect(x).toBeGreaterThan(210 / 2);
    // Debajo del logo (34 mm de ancho, cuadrado → termina en y = 12 + 34).
    expect(y).toBeGreaterThan(12 + 34);
    // Ya no está a la altura de "Sr(es):".
    const sr = /([\d.]+) Td\n\(Sr\\\(es\\\):\)/.exec(raw);
    expect(sr).not.toBeNull();
    expect(pageH - Number(sr![1]) / k).toBeGreaterThan(y);
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
