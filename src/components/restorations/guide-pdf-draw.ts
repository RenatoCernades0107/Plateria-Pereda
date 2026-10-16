import type { jsPDF } from "jspdf";

import type { GuidePdfModel } from "@/domain/guide-pdf";

import { PDF_ICONS } from "./pdf-icons";

/** Lado (mm) de los íconos del membrete. */
const ICON_SIZE = 3.4;
/** Color de la marca (`--primary`) y su tono claro, en RGB. */
const BRAND: [number, number, number] = [148, 101, 87];
const BRAND_LIGHT: [number, number, number] = [241, 233, 230];
const GRID = 200;
const MARGIN = 12;
/** Filas mínimas de la tabla (las que faltan se dibujan vacías, como en una guía impresa). */
const MIN_ROWS = 8;

type Column = {
  key:
    | "number"
    | "photo"
    | "code"
    | "quantity"
    | "description"
    | "service"
    | "status"
    | "location"
    | "price";
  title: string;
  width: number;
  align?: "left" | "center" | "right";
};

/**
 * Dibuja la guía en un A4 vertical (mm), al estilo de una guía impresa: logo y datos
 * de la empresa, recuadro con fecha y número, bloques de cliente y de la guía, tabla
 * de piezas con grilla, comentarios y totales, firmas y pie con el contacto.
 * `logo` y las fotos van como data URL JPEG/PNG.
 */
export async function drawGuidePdf(
  model: GuidePdfModel,
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
  const bar = (x: number, y: number, w: number, h: number, title: string) => {
    pdf.setFillColor(...BRAND).rect(x, y, w, h, "F");
    font("bold", 8.5).setTextColor(255);
    pdf.text(title, x + 2, y + h / 2 + 1.1);
    pdf.setTextColor(0);
  };

  // --- Encabezado: logo y empresa a la izquierda; título y recuadro a la derecha.
  let y = 10;
  let leftX = MARGIN;
  if (logo) {
    const props = pdf.getImageProperties(logo);
    const h = 28;
    const w = (props.width / props.height) * h;
    pdf.addImage(logo, MARGIN, y, w, h);
    leftX = MARGIN + w + 5;
  }
  let companyY = y + 5;
  model.companyLines.forEach(({ text, icon }, i) => {
    if (i === 0) font("bold", 11);
    else font("normal", 8, 90);
    // Con ícono, el texto va a su derecha y el ícono queda centrado en la línea.
    const textX = icon ? leftX + ICON_SIZE + 1.8 : leftX;
    if (icon)
      pdf.addImage(
        PDF_ICONS[icon],
        "PNG",
        leftX,
        companyY - 1.1 - ICON_SIZE / 2,
        ICON_SIZE,
        ICON_SIZE,
      );
    pdf.text(pdf.splitTextToSize(text, 80)[0] ?? "", textX, companyY);
    const nextIcon = model.companyLines[i + 1]?.icon;
    companyY += i === 0 ? 5 : icon || nextIcon ? ICON_SIZE + 1.2 : 4;
  });

  font("bold", 18).setTextColor(...BRAND);
  pdf.text(model.title, right, y + 7, { align: "right" });
  let metaY = y + 13;
  const boxW = 34;
  for (const [label, value] of model.meta) {
    font("normal", 8, 90);
    pdf.text(label.toUpperCase(), right - boxW - 3, metaY + 3.6, {
      align: "right",
    });
    pdf.setDrawColor(GRID).rect(right - boxW, metaY, boxW, 5.2);
    font(label === "Guía N°" ? "bold" : "normal", 8.5);
    pdf.text(value, right - boxW / 2, metaY + 3.7, { align: "center" });
    metaY += 6.2;
  }
  y = Math.max(y + (logo ? 28 : 0), companyY, metaY) + 5;

  // --- Bloques de cliente y de la guía.
  // Versión para taller: sin bloque del cliente, el de la guía va a la izquierda.
  const gap = 8;
  const blockW = (contentW - gap) / 2;
  const hasClient = model.client.length > 0;
  const guideBlockX = hasClient ? MARGIN + blockW + gap : MARGIN;
  if (hasClient) bar(MARGIN, y, blockW, 6, "CLIENTE");
  bar(guideBlockX, y, blockW, 6, "DATOS DE LA GUÍA");
  let clientY = y + 10.5;
  model.client.forEach((line, i) => {
    font(i === 0 ? "bold" : "normal", 8.5);
    const lines = pdf.splitTextToSize(line, blockW - 2);
    pdf.text(lines, MARGIN + 1, clientY);
    clientY += lines.length * 4.4;
  });
  let guideY = y + 10.5;
  const guideX = guideBlockX + 1;
  for (const [label, value] of model.guide) {
    font("normal", 8.5, 90);
    pdf.text(`${label}:`, guideX, guideY);
    font("normal", 8.5);
    pdf.text(value, guideX + 24, guideY);
    guideY += 4.4;
  }
  y = Math.max(clientY, guideY) + 4;

  // --- Tabla de piezas. Para el taller, la foto va siempre (o "Sin foto").
  const withPhoto = images !== null || model.forWorkshop;
  // La descripción toma el ancho que dejan las demás (la cantidad es angosta).
  const columns: Column[] = [
    { key: "number", title: "N°", width: 8, align: "center" },
    ...(withPhoto
      ? [{ key: "photo", title: "FOTO", width: 18 } as Column]
      : []),
    { key: "code", title: "CÓDIGO", width: 24 },
    { key: "quantity", title: "CANT.", width: 10, align: "center" },
    { key: "description", title: "DESCRIPCIÓN", width: 0 },
    { key: "service", title: "SERVICIO", width: 24 },
    { key: "status", title: "ESTADO", width: 21 },
    { key: "location", title: "UBICACIÓN", width: 19 },
    ...(model.showPrice
      ? [
          {
            key: "price",
            title: "IMPORTE",
            width: 22,
            align: "right",
          } as Column,
        ]
      : []),
  ];
  const description = columns.find((c) => c.key === "description")!;
  description.width = contentW - columns.reduce((sum, c) => sum + c.width, 0);
  const pad = 1.8;
  const lineH = 3.8;
  const headerH = 6.5;
  const xs: number[] = [];
  columns.reduce((x, c) => (xs.push(x), x + c.width), MARGIN);

  const drawTableHeader = () => {
    pdf.setFillColor(...BRAND).rect(MARGIN, y, contentW, headerH, "F");
    font("bold", 8).setTextColor(255);
    columns.forEach((c, i) => {
      pdf.text(c.title, xs[i]! + c.width / 2, y + 4.4, { align: "center" });
    });
    y += headerH;
  };
  const drawRowFrame = (h: number) => {
    const price = columns.findIndex((c) => c.key === "price");
    if (price >= 0)
      pdf
        .setFillColor(245, 245, 245)
        .rect(xs[price]!, y, columns[price]!.width, h, "F");
    pdf.setDrawColor(GRID).setLineWidth(0.2);
    pdf.rect(MARGIN, y, contentW, h);
    xs.slice(1).forEach((x) => pdf.line(x, y, x, y + h));
  };
  drawTableHeader();

  const textW = (key: Column["key"]) =>
    columns.find((c) => c.key === key)!.width - pad * 2;
  for (const row of model.rows) {
    font("normal", 8.5);
    const desc = pdf.splitTextToSize(row.description, textW("description"));
    font("normal", 7.5);
    const detail = row.detail
      ? pdf.splitTextToSize(row.detail, textW("description"))
      : [];
    const notes = row.notes
      ? pdf.splitTextToSize(`Nota: ${row.notes}`, textW("description"))
      : [];
    const service = pdf.splitTextToSize(row.service, textW("service"));
    const status = pdf.splitTextToSize(row.status, textW("status"));
    const location = pdf.splitTextToSize(row.location, textW("location"));
    const code = pdf.splitTextToSize(row.code, textW("code"));
    const lines = Math.max(
      desc.length + detail.length + notes.length,
      service.length,
      status.length,
      location.length,
      code.length,
    );
    const rowH = Math.max(lines * lineH + pad * 2, withPhoto ? 20 : 7);
    if (y + rowH > bottomLimit) {
      pdf.addPage();
      y = MARGIN;
      drawTableHeader();
    }
    drawRowFrame(rowH);
    const top = y + pad + 2.6;
    columns.forEach((c, i) => {
      const x = xs[i]!;
      switch (c.key) {
        case "number":
          font("normal", 8.5);
          pdf.text(String(row.number), x + c.width / 2, top, {
            align: "center",
          });
          break;
        case "photo": {
          const image = images?.get(row.id);
          if (image) {
            // Encajada en un cuadrado, sin deformarla.
            const size = c.width - pad * 2;
            const props = pdf.getImageProperties(image);
            const scale = size / Math.max(props.width, props.height);
            const w = props.width * scale;
            const h = props.height * scale;
            pdf.addImage(
              image,
              x + pad + (size - w) / 2,
              y + pad + (size - h) / 2,
              w,
              h,
            );
          } else {
            font("italic", 7, 140);
            pdf.text("Sin foto", x + c.width / 2, top, { align: "center" });
          }
          break;
        }
        case "code":
          font("bold", 8.5);
          pdf.text(code, x + pad, top);
          break;
        case "description": {
          let ty = top;
          font("normal", 8.5);
          pdf.text(desc, x + pad, ty);
          ty += desc.length * lineH;
          font("normal", 7.5, 100);
          if (detail.length) {
            pdf.text(detail, x + pad, ty);
            ty += detail.length * lineH;
          }
          if (notes.length) {
            font("italic", 7.5, 100);
            pdf.text(notes, x + pad, ty);
          }
          break;
        }
        case "service":
          font("normal", 8);
          pdf.text(service, x + pad, top);
          break;
        case "quantity":
          font("normal", 8.5);
          pdf.text(row.quantity, x + c.width / 2, top, { align: "center" });
          break;
        case "status":
          font("normal", 8);
          pdf.text(status, x + pad, top);
          break;
        case "location":
          font("normal", 8);
          pdf.text(location, x + pad, top);
          break;
        case "price":
          font("normal", 8.5);
          pdf.text(row.price ?? "", x + c.width - pad, top, {
            align: "right",
          });
          break;
      }
    });
    y += rowH;
  }

  // Filas vacías hasta el mínimo, si caben con el cierre en la misma página.
  const closingH = 82;
  for (
    let n = model.rows.length;
    n < MIN_ROWS && y + 7 + closingH <= bottomLimit;
    n++
  ) {
    drawRowFrame(7);
    y += 7;
  }

  // --- Cierre: comentarios a la izquierda y totales a la derecha.
  if (y + closingH > bottomLimit) {
    pdf.addPage();
    y = MARGIN;
  }
  y += 5;
  const totalsW = 70;
  const commentsW = model.totals.length ? contentW - totalsW - gap : contentW;
  font("normal", 8.5);
  const notes = model.notes
    ? pdf.splitTextToSize(model.notes, commentsW - pad * 2)
    : [];
  const commentsH = Math.max(28, notes.length * lineH + pad * 2 + 2);
  pdf.setFillColor(215, 215, 215).rect(MARGIN, y, commentsW, 6, "F");
  font("bold", 8);
  pdf.text("COMENTARIOS O INSTRUCCIONES ESPECIALES", MARGIN + 2, y + 4.1);
  pdf.setDrawColor(GRID).rect(MARGIN, y, commentsW, 6 + commentsH);
  if (notes.length) {
    font("normal", 8.5);
    pdf.text(notes, MARGIN + pad, y + 6 + pad + 2.6);
  }

  let totalsY = y;
  if (model.totals.length) {
    const valueW = 30;
    for (const t of model.totals) {
      const h = 6;
      if (t.strong) {
        pdf
          .setFillColor(...BRAND_LIGHT)
          .rect(right - valueW, totalsY, valueW, h, "F");
      }
      pdf.setDrawColor(GRID).rect(right - valueW, totalsY, valueW, h);
      font(t.strong ? "bold" : "normal", 8.5);
      pdf.text(t.label.toUpperCase(), right - valueW - 3, totalsY + 4.1, {
        align: "right",
      });
      pdf.text(t.value, right - pad, totalsY + 4.1, { align: "right" });
      totalsY += h + 1;
    }
    if (model.totalsNote) {
      font("italic", 7.5, 110);
      pdf.text(
        pdf.splitTextToSize(model.totalsNote, totalsW),
        right,
        totalsY + 3,
        { align: "right" },
      );
      totalsY += 6;
    }
  }
  y = Math.max(y + 6 + commentsH, totalsY) + 18;

  // --- Cláusula para el cliente.
  if (model.clause) {
    y -= 10;
    font("bold", 8);
    const clause = pdf.splitTextToSize(model.clause, contentW);
    pdf.text(clause, MARGIN, y);
    y += clause.length * 3.8 + 14;
  }

  // --- Firmas (no van en la versión para taller).
  if (model.signer) {
    const signW = 60;
    pdf.setDrawColor(120).setLineWidth(0.3);
    pdf.line(MARGIN + 10, y, MARGIN + 10 + signW, y);
    pdf.line(right - 10 - signW, y, right - 10, y);
    font("normal", 8, 90);
    pdf.text("Recibí conforme (cliente)", MARGIN + 10 + signW / 2, y + 4, {
      align: "center",
    });
    pdf.text(model.signer, right - 10 - signW / 2, y + 4, { align: "center" });
  }

  // --- Pie: contacto (última página) y numeración.
  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page);
    if (page === pages && model.footer) {
      font("normal", 8, 90);
      pdf.text(
        pdf.splitTextToSize(model.footer, contentW),
        pageW / 2,
        pageH - 11,
        { align: "center" },
      );
    }
    font("normal", 7, 150);
    pdf.text(`${model.code} · Página ${page} de ${pages}`, right, pageH - 5, {
      align: "right",
    });
  }
  return pdf;
}
