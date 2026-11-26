import type { jsPDF } from "jspdf";

import type { SettlementReportModel } from "@/domain/settlement-report";

/** Color de la marca (`--primary`), en RGB. */
const BRAND: [number, number, number] = [148, 101, 87];
const GRID = 200;
const MARGIN = 12;

type Column = {
  key:
    | "number"
    | "code"
    | "quantity"
    | "description"
    | "service"
    | "provider"
    | "status"
    | "serviceCost";
  title: string;
  width: number;
  align?: "left" | "center" | "right";
};

/**
 * Dibuja la liquidación de servicios por proveedor en un A4 horizontal (mm): logo,
 * título, fecha de impresión y (si hay) el filtro de fecha arriba; una fila por pieza
 * con su proveedor y costo de servicio, y al final el total. `logo` va como data URL.
 */
export async function drawSettlementReport(
  model: SettlementReportModel,
  { logo = null }: { logo?: string | null } = {},
): Promise<jsPDF> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({
    unit: "mm",
    format: "a4",
    orientation: "landscape",
  });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const right = pageW - MARGIN;
  const contentW = pageW - MARGIN * 2;
  const bottomLimit = pageH - 16;
  const font = (style: "normal" | "bold" | "italic", size: number, gray = 0) =>
    pdf.setFont("helvetica", style).setFontSize(size).setTextColor(gray);

  // --- Encabezado.
  const top = 10;
  if (logo) {
    const props = pdf.getImageProperties(logo);
    const h = 28;
    pdf.addImage(logo, MARGIN, top, (props.width / props.height) * h, h);
  }
  font("bold", 15).setTextColor(...BRAND);
  pdf.text(model.title, right, top + 8, { align: "right" });
  const boxW = 34;
  font("normal", 8, 90);
  pdf.text("FECHA DE IMPRESIÓN", right - boxW - 3, top + 16.6, {
    align: "right",
  });
  pdf
    .setDrawColor(GRID)
    .setLineWidth(0.2)
    .rect(right - boxW, top + 13, boxW, 5.2);
  font("bold", 8.5);
  pdf.text(model.printedAt, right - boxW / 2, top + 16.7, { align: "center" });
  if (model.dateFilter) {
    font("bold", 9);
    pdf.text(`FILTRO DE FECHA  ${model.dateFilter}`, right, top + 25, {
      align: "right",
    });
  }
  let y = top + 28 + 6;

  // --- Tabla.
  const columns: Column[] = [
    { key: "number", title: "N°", width: 10, align: "center" },
    { key: "code", title: "CÓDIGO", width: 32 },
    { key: "quantity", title: "CANT.", width: 12, align: "center" },
    { key: "description", title: "DESCRIPCIÓN", width: 0 },
    { key: "service", title: "SERVICIO", width: 36 },
    { key: "provider", title: "PROVEEDOR", width: 40 },
    { key: "status", title: "ESTADO", width: 26 },
    { key: "serviceCost", title: "COSTO SERV.", width: 28, align: "right" },
  ];
  const description = columns.find((c) => c.key === "description")!;
  description.width = contentW - columns.reduce((sum, c) => sum + c.width, 0);
  const pad = 1.8;
  const lineH = 3.8;
  const xs: number[] = [];
  columns.reduce((x, c) => (xs.push(x), x + c.width), MARGIN);

  const wrap = (text: string, width: number): string[] =>
    (pdf.splitTextToSize(text, width) as string[]).flatMap((line) => {
      if (pdf.getTextWidth(line) <= width) return [line];
      const parts: string[] = [];
      let current = "";
      for (const char of line) {
        if (current && pdf.getTextWidth(current + char) > width) {
          parts.push(current);
          current = "";
        }
        current += char;
      }
      return current ? [...parts, current] : parts;
    });
  const textW = (key: Column["key"]) =>
    columns.find((c) => c.key === key)!.width - pad * 2;

  const headerH = 8;
  const drawTableHeader = () => {
    pdf.setFillColor(...BRAND).rect(MARGIN, y, contentW, headerH, "F");
    font("bold", 8).setTextColor(255);
    columns.forEach((c, i) => {
      pdf.text(c.title, xs[i]! + c.width / 2, y + 5.2, { align: "center" });
    });
    y += headerH;
  };
  drawTableHeader();

  for (const row of model.rows) {
    font("normal", 8.5);
    const desc = wrap(row.description, textW("description"));
    font("normal", 8);
    const service = wrap(row.service, textW("service"));
    const provider = wrap(row.provider, textW("provider"));
    const status = wrap(row.status, textW("status"));
    font("bold", 8.5);
    const code = wrap(row.code, textW("code"));
    const lines = Math.max(
      desc.length,
      service.length,
      provider.length,
      status.length,
      code.length,
    );
    const rowH = Math.max(lines * lineH + pad * 2, 9);
    if (y + rowH > bottomLimit) {
      pdf.addPage();
      y = MARGIN;
      drawTableHeader();
    }
    pdf.setDrawColor(GRID).setLineWidth(0.2);
    pdf.rect(MARGIN, y, contentW, rowH);
    xs.slice(1).forEach((x) => pdf.line(x, y, x, y + rowH));
    const textTop = y + pad + 2.6;
    columns.forEach((c, i) => {
      const x = xs[i]!;
      switch (c.key) {
        case "number":
          font("normal", 8.5);
          pdf.text(String(row.number), x + c.width / 2, textTop, {
            align: "center",
          });
          break;
        case "code":
          font("bold", 8.5);
          pdf.text(code, x + pad, textTop);
          break;
        case "quantity":
          font("normal", 8.5);
          pdf.text(row.quantity, x + c.width / 2, textTop, { align: "center" });
          break;
        case "description":
          font("normal", 8.5);
          pdf.text(desc, x + pad, textTop);
          break;
        case "service":
          font("normal", 8);
          pdf.text(service, x + pad, textTop);
          break;
        case "provider":
          font("normal", 8);
          pdf.text(provider, x + pad, textTop);
          break;
        case "status":
          font("normal", 8);
          pdf.text(status, x + pad, textTop);
          break;
        case "serviceCost":
          font("normal", 8.5);
          pdf.text(row.serviceCost, x + c.width - pad, textTop, {
            align: "right",
          });
          break;
      }
    });
    y += rowH;
  }

  // --- Total.
  if (y + 14 > bottomLimit) {
    pdf.addPage();
    y = MARGIN;
  }
  font("bold", 11);
  pdf.text(`TOTAL COSTO DE SERVICIO: ${model.totalServiceCost}`, right, y + 8, {
    align: "right",
  });
  if (model.withoutCost > 0) {
    font("italic", 7.5, 120);
    pdf.text(
      model.withoutCost === 1
        ? "1 pieza sin costo de servicio definido (no suma al total)."
        : `${model.withoutCost} piezas sin costo de servicio definido (no suman al total).`,
      right,
      y + 13,
      { align: "right" },
    );
  }

  // --- Pie.
  const footer = [model.title, model.printedAt]
    .concat(model.generatedBy ? [`Generado por ${model.generatedBy}`] : [])
    .join(" · ");
  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page);
    font("normal", 7, 150);
    pdf.text(`${footer} · Página ${page} de ${pages}`, right, pageH - 5, {
      align: "right",
    });
  }
  return pdf;
}
