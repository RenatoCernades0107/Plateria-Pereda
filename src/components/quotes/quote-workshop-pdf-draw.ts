import type { jsPDF } from "jspdf";

import type { WorkshopPdfModel } from "@/domain/quote-workshop-pdf";

/**
 * Dibuja la orden para taller de varias cotizaciones en un A4 vertical (mm), con el
 * estilo de la guía para taller: logo y rótulo "TALLER", título y recuadro con la
 * fecha y los totales; luego, por cotización, una barra con el código, el cliente y
 * la fecha de entrega del taller, sus datos y la tabla de productos (foto grande,
 * SKU, cantidad, producto y variante, y la personalización completa), y sus instrucciones para el taller.
 * `logo` y las fotos (por id de línea) van como data URL JPEG/PNG.
 */

const BRAND: [number, number, number] = [148, 101, 87];
const BRAND_LIGHT: [number, number, number] = [241, 233, 230];
const GRID = 200;
const MARGIN = 12;
/** Lado de la foto de cada producto (mm): más grande que en la guía, para fabricar. */
const PHOTO = 32;

type Column = {
  key: "number" | "photo" | "sku" | "quantity" | "product" | "customization";
  title: string;
  width: number;
  align?: "left" | "center";
};

export async function drawQuoteWorkshopPdf(
  model: WorkshopPdfModel,
  {
    logo = null,
    images = new Map(),
  }: { logo?: string | null; images?: Map<string, string> } = {},
): Promise<jsPDF> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const right = pageW - MARGIN;
  const contentW = pageW - MARGIN * 2;
  const bottomLimit = pageH - 14;
  const font = (style: "normal" | "bold" | "italic", size: number, gray = 0) =>
    pdf.setFont("helvetica", style).setFontSize(size).setTextColor(gray);

  // --- Encabezado: logo y "TALLER" a la izquierda; título y recuadro a la derecha.
  let y = 10;
  let leftX = MARGIN;
  if (logo) {
    const props = pdf.getImageProperties(logo);
    const h = 24;
    const w = (props.width / props.height) * h;
    pdf.addImage(logo, MARGIN, y, w, h);
    leftX = MARGIN + w + 5;
  }
  font("bold", 14);
  pdf.text("TALLER", leftX, y + 8);
  font("normal", 8, 90);
  pdf.text("Productos personalizados por fabricar", leftX, y + 13);

  font("bold", 18).setTextColor(...BRAND);
  pdf.text(model.title, right, y + 7, { align: "right" });
  let metaY = y + 12;
  const boxW = 30;
  const boxH = 6.6;
  for (const [label, value] of model.meta) {
    font("bold", 9.5, 90);
    pdf.text(label.toUpperCase(), right - boxW - 3, metaY + 4.6, {
      align: "right",
    });
    pdf
      .setDrawColor(GRID)
      .setLineWidth(0.2)
      .rect(right - boxW, metaY, boxW, boxH);
    font("normal", 10.5);
    pdf.text(value, right - boxW / 2, metaY + 4.7, { align: "center" });
    metaY += boxH + 1.2;
  }
  y = Math.max(y + (logo ? 24 : 16), metaY) + 5;

  // --- Columnas de la tabla de productos (la personalización toma el resto).
  const columns: Column[] = [
    { key: "number", title: "N°", width: 8, align: "center" },
    { key: "photo", title: "FOTO", width: PHOTO + 4, align: "center" },
    { key: "sku", title: "SKU", width: 27 },
    { key: "quantity", title: "CANT.", width: 12, align: "center" },
    { key: "product", title: "PRODUCTO / VARIANTE", width: 42 },
    { key: "customization", title: "PERSONALIZACIÓN", width: 0 },
  ];
  const custom = columns.find((c) => c.key === "customization")!;
  custom.width = contentW - columns.reduce((sum, c) => sum + c.width, 0);
  const xs: number[] = [];
  columns.reduce((x, c) => (xs.push(x), x + c.width), MARGIN);
  const pad = 1.8;
  const lineH = 4;
  const headerH = 6;
  const textW = (key: Column["key"]) =>
    columns.find((c) => c.key === key)!.width - pad * 2;

  const newPage = () => {
    pdf.addPage();
    y = MARGIN;
  };
  const drawTableHeader = () => {
    pdf.setFillColor(215, 215, 215).rect(MARGIN, y, contentW, headerH, "F");
    font("bold", 7.5, 40);
    columns.forEach((c, i) => {
      pdf.text(c.title, xs[i]! + c.width / 2, y + 4.1, { align: "center" });
    });
    y += headerH;
  };

  model.sections.forEach((section, index) => {
    // Medidas de cada fila antes de dibujar, para no dejar la barra sola al pie.
    const rows = section.rows.map((row) => {
      font("bold", 9);
      const product = pdf.splitTextToSize(row.product, textW("product"));
      font("normal", 8.5);
      const variant = row.variant
        ? pdf.splitTextToSize(row.variant, textW("product"))
        : [];
      font("normal", 9.5);
      const customization = pdf.splitTextToSize(
        row.customization || "Sin personalización",
        textW("customization"),
      );
      font("normal", 8);
      const sku = pdf.splitTextToSize(row.sku, textW("sku"));
      const lines = Math.max(
        product.length + variant.length,
        customization.length,
        sku.length,
      );
      const h = Math.max(lines * lineH + pad * 2 + 1, PHOTO + pad * 2);
      return { row, product, variant, customization, sku, h };
    });
    font("normal", 8.5);
    const infoText = section.info.map(([l, v]) => `${l}: ${v}`).join("     ");
    const headH = 8 + 6 + headerH;

    if (index > 0) y += 6;
    if (y + headH + (rows[0]?.h ?? 0) > bottomLimit) newPage();

    // Barra: código y cliente a la izquierda; entrega del taller a la derecha.
    pdf.setFillColor(...BRAND).rect(MARGIN, y, contentW, 8, "F");
    font("bold", 10.5).setTextColor(255);
    const title = section.clientName
      ? `${section.code}  ·  ${section.clientName}`
      : section.code;
    const deadlineW = section.deadline
      ? pdf.getTextWidth(section.deadline) + 6
      : 0;
    pdf.text(
      pdf.splitTextToSize(title, contentW - deadlineW - 4)[0] ?? "",
      MARGIN + 2.5,
      y + 5.5,
    );
    if (section.deadline) {
      pdf.text(section.deadline, right - 2.5, y + 5.5, { align: "right" });
    }
    y += 8;
    pdf.setFillColor(...BRAND_LIGHT).rect(MARGIN, y, contentW, 6, "F");
    font("normal", 8, 60);
    pdf.text(infoText, MARGIN + 2.5, y + 4.1);
    y += 6;
    drawTableHeader();

    for (const r of rows) {
      if (y + r.h > bottomLimit) {
        newPage();
        // En la página nueva se repite de qué cotización son las filas.
        font("bold", 8.5).setTextColor(...BRAND);
        pdf.text(`${section.code} (continuación)`, MARGIN, y + 3);
        y += 5;
        drawTableHeader();
      }
      pdf.setDrawColor(GRID).setLineWidth(0.2);
      pdf.rect(MARGIN, y, contentW, r.h);
      xs.slice(1).forEach((x) => pdf.line(x, y, x, y + r.h));
      const top = y + pad + 3;
      columns.forEach((c, i) => {
        const x = xs[i]!;
        switch (c.key) {
          case "number":
            font("bold", 9);
            pdf.text(String(r.row.number), x + c.width / 2, top, {
              align: "center",
            });
            break;
          case "photo": {
            const image = images.get(r.row.id);
            if (image) {
              const props = pdf.getImageProperties(image);
              const scale = PHOTO / Math.max(props.width, props.height);
              const w = props.width * scale;
              const h = props.height * scale;
              pdf.addImage(
                image,
                x + (c.width - w) / 2,
                y + pad + (PHOTO - h) / 2,
                w,
                h,
              );
            } else {
              font("italic", 7.5, 140);
              pdf.text("Sin foto", x + c.width / 2, y + pad + PHOTO / 2, {
                align: "center",
              });
            }
            break;
          }
          case "sku":
            font("normal", 8);
            pdf.text(r.sku, x + pad, top);
            break;
          case "quantity":
            font("bold", 12);
            pdf.text(r.row.quantity, x + c.width / 2, top + 1, {
              align: "center",
            });
            break;
          case "product":
            font("bold", 9);
            pdf.text(r.product, x + pad, top);
            if (r.variant.length) {
              font("normal", 8.5, 80);
              pdf.text(r.variant, x + pad, top + r.product.length * lineH);
            }
            break;
          case "customization":
            if (r.row.customization) font("normal", 9.5);
            else font("italic", 8.5, 140);
            pdf.text(r.customization, x + pad, top);
            break;
        }
      });
      y += r.h;
    }

    // Instrucciones para el taller, si tiene.
    if (section.notes) {
      font("normal", 8.5);
      const notes = pdf.splitTextToSize(section.notes, contentW - pad * 2);
      const h = notes.length * lineH + pad * 2 + 5;
      if (y + h > bottomLimit) newPage();
      pdf.setDrawColor(GRID).rect(MARGIN, y, contentW, h);
      font("bold", 7.5, 70);
      pdf.text("INSTRUCCIONES PARA TALLER", MARGIN + pad, y + 4);
      font("normal", 8.5);
      pdf.text(notes, MARGIN + pad, y + 8.5);
      y += h;
    }
  });

  // --- Numeración de páginas.
  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page);
    font("normal", 7, 150);
    pdf.text(
      `${model.footerLabel} · Página ${page} de ${pages}`,
      right,
      pageH - 5,
      { align: "right" },
    );
  }
  return pdf;
}
