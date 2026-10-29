import type { jsPDF } from "jspdf";

import type { QuotePdfModel } from "@/domain/quote-pdf";

/**
 * Dibuja la cotización en un A4 vertical (mm), al estilo de la cotización en papel de
 * la tienda: fecha a la izquierda, logo con la dirección centrada debajo a la
 * derecha, código, cliente y contacto, tabla de productos sin grilla, totales, monto en
 * letras, condición de pago, tiempo de entrega y condiciones. `logo` va como data
 * URL PNG/JPEG. Los textos fijos usan solo caracteres de WinAnsi (Helvetica de
 * jsPDF no tiene, p. ej., el signo menos U+2212).
 */

const MARGIN = 18;
const GRAY = 110;

type Column = {
  key: "sku" | "description" | "quantity" | "unitPrice" | "total";
  title: string;
  width: number;
  align?: "left" | "center" | "right";
};

export async function drawQuotePdf(
  model: QuotePdfModel,
  { logo = null }: { logo?: string | null } = {},
): Promise<jsPDF> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const right = pageW - MARGIN;
  const contentW = pageW - MARGIN * 2;
  const bottomLimit = pageH - 16;
  const font = (style: "normal" | "bold" | "italic", size: number, gray = 0) =>
    pdf.setFont("helvetica", style).setFontSize(size).setTextColor(gray);
  const line = (x1: number, yy: number, x2: number) => {
    pdf.setDrawColor(0).setLineWidth(0.2);
    pdf.line(x1, yy, x2, yy);
  };

  // --- Encabezado: fecha a la izquierda; logo y, debajo, la dirección de la
  // empresa (centrada bajo el logo) a la derecha.
  let y = 18;
  const logoW = 34;
  const logoCenter = right - logoW / 2;
  let rightBottom = y - 6;
  if (logo) {
    const props = pdf.getImageProperties(logo);
    const h = (props.height / props.width) * logoW;
    pdf.addImage(logo, right - logoW, y - 6, logoW, h);
    rightBottom = y - 6 + h;
  }
  if (model.companyAddress) {
    font("bold", 8.5);
    const address = pdf.splitTextToSize(model.companyAddress, logoW + 8);
    const addressLineH = 3.6;
    const addressY = logo ? rightBottom + 4 : y;
    pdf.text(address, logoCenter, addressY, {
      align: "center",
      lineHeightFactor: addressLineH / (8.5 * 0.3528),
    });
    rightBottom = addressY + (address.length - 1) * addressLineH + 1;
  }
  font("normal", 10.5);
  pdf.text(model.dateLine, MARGIN, y);
  y = Math.max(y, rightBottom) + 12;

  // --- Código de la cotización, justo encima del cliente.
  font("bold", 12);
  pdf.text("Cotización N°:", MARGIN, y);
  const labelW = pdf.getTextWidth("Cotización N°: ");
  font("normal", 12);
  pdf.text(model.code, MARGIN + labelW, y);
  y += 10;

  // --- Cliente y contacto.
  const fieldLabelW = 22;
  font("normal", 10);
  pdf.text("Sr(es):", MARGIN, y);
  const client = pdf.splitTextToSize(model.clientName, contentW - fieldLabelW);
  pdf.text(client, MARGIN + fieldLabelW, y);
  y += Math.max(1, client.length) * 4.6 + 1.4;
  pdf.text("Contacto:", MARGIN, y);
  pdf.text(model.contactName, MARGIN + fieldLabelW, y);
  y += 12;

  // --- Tabla de productos: sin grilla, solo una línea bajo el encabezado.
  const columns: Column[] = [
    { key: "sku", title: "SKU", width: 24 },
    { key: "description", title: "Descripción", width: 0 },
    { key: "quantity", title: "Cant.", width: 16, align: "center" },
    { key: "unitPrice", title: "Precio sin IGV", width: 34, align: "right" },
    { key: "total", title: "total (sin IGV)", width: 34, align: "right" },
  ];
  const description = columns.find((c) => c.key === "description")!;
  description.width = contentW - columns.reduce((sum, c) => sum + c.width, 0);
  const xs: number[] = [];
  columns.reduce((x, c) => (xs.push(x), x + c.width), MARGIN);
  const textX = (i: number, c: Column) =>
    c.align === "right"
      ? xs[i]! + c.width
      : c.align === "center"
        ? xs[i]! + c.width / 2
        : xs[i]!;

  const drawTableHeader = () => {
    font("italic", 9);
    columns.forEach((c, i) => {
      pdf.text(c.title, textX(i, c), y, { align: c.align ?? "left" });
    });
    y += 2;
    line(MARGIN, y, right);
    y += 6;
  };
  drawTableHeader();

  const lineH = 4.6;
  for (const row of model.rows) {
    font("normal", 9.5);
    const desc = pdf.splitTextToSize(row.description, description.width - 2);
    const rows = Math.max(1, desc.length);
    if (y + rows * lineH > bottomLimit) {
      pdf.addPage();
      y = MARGIN;
      drawTableHeader();
    }
    columns.forEach((c, i) => {
      const align = c.align ?? "left";
      const x = textX(i, c);
      switch (c.key) {
        case "sku":
          font("normal", 9);
          pdf.text(row.sku || "—", x, y);
          break;
        case "description":
          font("normal", 9.5);
          pdf.text(desc, x, y);
          break;
        case "quantity":
          font("normal", 9.5);
          pdf.text(row.quantity, x, y, { align });
          break;
        case "unitPrice":
          font("normal", 9.5);
          pdf.text(row.unitPrice, x, y, { align });
          break;
        case "total":
          font("normal", 9.5);
          pdf.text(row.total, x, y, { align });
          break;
      }
    });
    y += rows * lineH + 3;
  }

  // --- Totales: línea arriba, Sub Total y Total Venta a la derecha.
  if (y + 40 > bottomLimit) {
    pdf.addPage();
    y = MARGIN;
  }
  y += 4;
  line(MARGIN, y, right);
  y += 8;
  const totalRow = (label: string, value: string, strong: boolean) => {
    font(strong ? "bold" : "normal", strong ? 12 : 10);
    pdf.text(label, right - 55, y);
    pdf.text(value, right, y, { align: "right" });
    y += strong ? 8 : 6;
  };
  totalRow("Sub Total:", model.subtotal, false);
  // Guion ASCII: el signo menos (U+2212) no existe en Helvetica/WinAnsi de jsPDF.
  if (model.discount) totalRow("Descuento:", `- ${model.discount}`, false);
  totalRow("Total Venta:", model.total, true);
  y += 4;

  // --- "Son:" y condiciones fijas (validez, impuesto).
  font("italic", 10);
  pdf.text("Son:", MARGIN, y);
  font("bold", 10);
  const words = pdf.splitTextToSize(model.amountInWords, contentW - 16);
  pdf.text(words, MARGIN + 12, y);
  y += (Math.max(1, words.length) - 1) * 4.6 + 10;

  // Columna de etiquetas con espacio para la más larga ("Tiempo de entrega:").
  const infoLabelW = 34;
  const infoRow = (label: string, value: string, bold = false) => {
    font("normal", 9.5, GRAY);
    pdf.text(label, MARGIN, y);
    font(bold ? "bold" : "normal", 9.5);
    const text = pdf.splitTextToSize(value, contentW - infoLabelW);
    pdf.text(text, MARGIN + infoLabelW, y);
    y += Math.max(1, text.length) * 4.2 + 1.5;
  };
  infoRow("Condición:", model.paymentConditionText);
  infoRow("Tiempo de entrega:", model.deliveryText);
  if (model.notes) infoRow("Notas:", model.notes);
  infoRow("Validez:", model.validityText);
  infoRow("Impuesto:", "LOS PRECIOS NO INCLUYEN IGV", true);
  if (model.terms) {
    y += 2;
    font("normal", 9.5, GRAY);
    pdf.text("Condiciones:", MARGIN, y);
    y += 4.5;
    font("normal", 9.5);
    const terms = pdf.splitTextToSize(model.terms, contentW);
    pdf.text(terms, MARGIN, y);
    y += terms.length * 4.2;
  }

  // --- Firma.
  if (model.signer) {
    if (y + 20 > bottomLimit) {
      pdf.addPage();
      y = MARGIN;
    }
    y += 14;
    font("normal", 10);
    pdf.text("Atentamente,", MARGIN, y);
    y += 7;
    font("bold", 10);
    pdf.text(model.signer, MARGIN, y);
  }

  // --- Pie: numeración.
  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page);
    font("normal", 7, 150);
    pdf.text(`${model.code} · Página ${page} de ${pages}`, right, pageH - 8, {
      align: "right",
    });
  }
  return pdf;
}
