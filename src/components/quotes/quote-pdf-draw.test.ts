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

  it("la dirección va centrada bajo el logo y el código justo encima de Sr(es):", async () => {
    const logo =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    const pdf = await drawQuotePdf(quotePdfModel(data), { logo });
    const raw = pdf.output();
    const pageH = pdf.internal.pageSize.getHeight();
    const k = 72 / 25.4;
    const at = (text: RegExp) => {
      const match = new RegExp(
        String.raw`([\d.]+) ([\d.]+) Td\n\(` + text.source,
      ).exec(raw);
      expect(match).not.toBeNull();
      return { x: Number(match![1]) / k, y: pageH - Number(match![2]) / k };
    };
    // Envuelta al ancho del logo: "Calle Coronel Inclán 928," / "Miraflores".
    const address = at(/Calle Coronel Incl/);
    // Logo de 34 mm pegado al margen derecho: su centro está en 210 - 18 - 17.
    const center = 210 - 18 - 17;
    expect(address.x).toBeLessThan(center);
    expect(address.x).toBeGreaterThan(210 - 18 - 34 - 4);
    // Debajo del logo (cuadrado → termina en y = 12 + 34).
    expect(address.y).toBeGreaterThan(12 + 34);
    // En negrita (F2 = Helvetica-Bold) y centrada: la segunda línea, más corta,
    // se corre a la derecha respecto de la primera.
    const block =
      /\/(F\d) [\d.]+ Tf[^]*?\(Calle Coronel Incl[^)]*\) Tj\n([\d.]+) (-[\d.]+) Td\n\(Miraflores\)/.exec(
        raw,
      );
    expect(block).not.toBeNull();
    expect(block![1]).toBe("F2");
    expect(Number(block![2])).toBeGreaterThan(0);
    const miraflores = { y: address.y - Number(block![3]) / k };
    // "Cotización N°:" va entre la dirección y "Sr(es):".
    const code = at(/Cotizaci/);
    const sr = at(/Sr\\\(es\\\):\)/);
    expect(code.y).toBeGreaterThan(miraflores.y);
    expect(sr.y).toBeGreaterThan(code.y);
    expect(sr.y - code.y).toBeLessThan(15);
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
