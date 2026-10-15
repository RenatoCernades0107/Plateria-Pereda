import type { jsPDF } from "jspdf";

import type { ProviderReportModel } from "@/domain/provider-report";

/** Color de la marca (`--primary`), en RGB. */
const BRAND: [number, number, number] = [148, 101, 87];
const GRID = 200;
const MARGIN = 12;
const PHOTO = 36;
const PAD = 3;
const LINE_H = 4;

/**
 * Dibuja el reporte para el proveedor en un A4 vertical (mm): logo, título y fecha de
 * impresión arriba, y una ficha por pieza (foto, código, estado, descripción, servicio,
 * material, medidas, peso y servicio a realizar). `logo` y las fotos van como data URL.
 */
export async function drawProviderReport(
  model: ProviderReportModel,
  {
    logo = null,
    images = null,
  }: { logo?: string | null; images?: Map<string, string> | null } = {},
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

  // --- Encabezado: logo a la izquierda; título y fecha de impresión a la derecha.
  const top = 10;
  if (logo) {
    const props = pdf.getImageProperties(logo);
    const h = 28;
    pdf.addImage(logo, MARGIN, top, (props.width / props.height) * h, h);
  }
  font("bold", 17).setTextColor(...BRAND);
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
  let y = top + 28 + 6;

  // --- Una ficha por pieza.
  const textX = MARGIN + PAD + PHOTO + 4;
  const textW = right - PAD - textX;
  const colW = textW / 2;
  for (const row of model.rows) {
    font("bold", 9.5);
    const description = pdf.splitTextToSize(row.description, textW);
    font("normal", 8.5);
    const task = pdf.splitTextToSize(row.task || "—", textW);
    const height =
      PAD * 2 +
      Math.max(
        PHOTO,
        7 +
          description.length * (LINE_H + 0.6) +
          2 +
          2 * 10 +
          4 +
          task.length * LINE_H,
      );
    if (y + height > bottomLimit) {
      pdf.addPage();
      y = MARGIN;
    }
    pdf.setDrawColor(GRID).setLineWidth(0.2).rect(MARGIN, y, contentW, height);

    // Foto, encajada en un cuadrado sin deformarla.
    const photoX = MARGIN + PAD;
    const photoY = y + PAD;
    pdf.rect(photoX, photoY, PHOTO, PHOTO);
    const image = images?.get(row.id);
    if (image) {
      const props = pdf.getImageProperties(image);
      const scale = PHOTO / Math.max(props.width, props.height);
      const w = props.width * scale;
      const h = props.height * scale;
      pdf.addImage(
        image,
        photoX + (PHOTO - w) / 2,
        photoY + (PHOTO - h) / 2,
        w,
        h,
      );
    } else {
      font("italic", 7, 140);
      pdf.text("Sin foto", photoX + PHOTO / 2, photoY + PHOTO / 2, {
        align: "center",
      });
    }

    // Código (guía y pieza) y estado.
    let ty = y + PAD + 4.5;
    font("bold", 11).setTextColor(...BRAND);
    pdf.text(row.code, textX, ty);
    font("normal", 8, 90);
    pdf.text(`Estado: ${row.status}`, right - PAD, ty, { align: "right" });
    ty += 6;

    // Descripción.
    font("bold", 9.5);
    pdf.text(description, textX, ty);
    ty += description.length * (LINE_H + 0.6) + 2;

    // Servicio, material, medidas y peso.
    const fields: [string, string][] = [
      ["Servicio", row.service],
      ["Material", row.material],
      ["Medidas", row.measure],
      ["Peso", row.weight],
    ];
    fields.forEach(([label, value], i) => {
      const x = textX + (i % 2) * colW;
      const fy = ty + Math.floor(i / 2) * 10;
      font("normal", 7, 120);
      pdf.text(label.toUpperCase(), x, fy);
      font("normal", 8.5);
      pdf.text(pdf.splitTextToSize(value, colW - 3)[0] ?? "", x, fy + 4);
    });
    ty += 2 * 10 + 1;

    // Servicio a realizar (las notas de la pieza).
    font("normal", 7, 120);
    pdf.text("SERVICIO A REALIZAR", textX, ty);
    font("normal", 8.5);
    pdf.text(task, textX, ty + 4);

    y += height + 4;
  }

  // --- Pie: numeración.
  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page);
    font("normal", 7, 150);
    pdf.text(
      `${model.title} · ${model.printedAt} · Página ${page} de ${pages}`,
      right,
      pageH - 5,
      { align: "right" },
    );
  }
  return pdf;
}
