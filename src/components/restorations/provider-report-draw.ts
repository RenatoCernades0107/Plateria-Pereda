import type { jsPDF } from "jspdf";

import type { ProviderReportModel } from "@/domain/provider-report";

/** Color de la marca (`--primary`), en RGB. */
const BRAND: [number, number, number] = [148, 101, 87];
const GRID = 200;
const MARGIN = 12;
/** Filas mínimas de la tabla (las que faltan se dibujan vacías, como en la guía). */
const MIN_ROWS = 8;

type Column = {
  key:
    | "number"
    | "photo"
    | "code"
    | "quantity"
    | "description"
    | "measure"
    | "weight"
    | "service"
    | "serviceCost"
    | "status"
    | "location";
  title: string;
  width: number;
  align?: "left" | "center" | "right";
};

/**
 * Dibuja el reporte para el proveedor en un A4 horizontal (mm), con la misma tabla que
 * la guía: logo, título y fecha de impresión arriba, y una fila por pieza (foto, código,
 * cantidad, descripción con material y servicio a realizar, medidas, peso, servicio,
 * costo de servicio si el modelo lo lleva, estado y ubicación). El código ya dice la
 * guía, así que no va aparte. Con costo de servicio, al final va su total.
 * Sin precio de venta ni datos del cliente. `logo` y las fotos van como data URL.
 */
export async function drawProviderReport(
  model: ProviderReportModel,
  {
    logo = null,
    images = null,
  }: { logo?: string | null; images?: Map<string, string> | null } = {},
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

  // --- Tabla de piezas.
  // La descripción toma el ancho que dejan las demás (la cantidad es angosta).
  const columns: Column[] = [
    { key: "number", title: "N°", width: 8, align: "center" },
    { key: "photo", title: "FOTO", width: 18 },
    { key: "code", title: "CÓDIGO", width: 26 },
    { key: "quantity", title: "CANT.", width: 11, align: "center" },
    { key: "description", title: "DESCRIPCIÓN", width: 0 },
    { key: "measure", title: "MEDIDAS", width: 24 },
    { key: "weight", title: "PESO", width: 16, align: "right" },
    { key: "service", title: "SERVICIO", width: 30 },
    ...(model.showServiceCost
      ? [
          {
            key: "serviceCost",
            title: "COSTO SERV.",
            width: 22,
            align: "right",
          } as const,
        ]
      : []),
    { key: "status", title: "ESTADO", width: 24 },
    { key: "location", title: "UBICACIÓN", width: 22 },
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
    pdf.setDrawColor(GRID).setLineWidth(0.2);
    pdf.rect(MARGIN, y, contentW, h);
    xs.slice(1).forEach((x) => pdf.line(x, y, x, y + h));
  };
  const textW = (key: Column["key"]) =>
    columns.find((c) => c.key === key)!.width - pad * 2;
  drawTableHeader();

  for (const row of model.rows) {
    font("normal", 8.5);
    const desc = pdf.splitTextToSize(row.description, textW("description"));
    font("normal", 7.5);
    const detail = row.detail
      ? pdf.splitTextToSize(row.detail, textW("description"))
      : [];
    const task = row.task
      ? pdf.splitTextToSize(
          `Servicio a realizar: ${row.task}`,
          textW("description"),
        )
      : [];
    const service = pdf.splitTextToSize(row.service, textW("service"));
    const status = pdf.splitTextToSize(row.status, textW("status"));
    const location = pdf.splitTextToSize(row.location, textW("location"));
    const code = pdf.splitTextToSize(row.code, textW("code"));
    const measure = pdf.splitTextToSize(row.measure, textW("measure"));
    const lines = Math.max(
      desc.length + detail.length + task.length,
      service.length,
      status.length,
      location.length,
      code.length,
      measure.length,
    );
    const rowH = Math.max(lines * lineH + pad * 2, 20);
    if (y + rowH > bottomLimit) {
      pdf.addPage();
      y = MARGIN;
      drawTableHeader();
    }
    drawRowFrame(rowH);
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
            pdf.text("Sin foto", x + c.width / 2, textTop, { align: "center" });
          }
          break;
        }
        case "code":
          font("bold", 8.5);
          pdf.text(code, x + pad, textTop);
          break;
        case "description": {
          let ty = textTop;
          font("normal", 8.5);
          pdf.text(desc, x + pad, ty);
          ty += desc.length * lineH;
          font("normal", 7.5, 100);
          if (detail.length) {
            pdf.text(detail, x + pad, ty);
            ty += detail.length * lineH;
          }
          if (task.length) {
            font("italic", 7.5, 100);
            pdf.text(task, x + pad, ty);
          }
          break;
        }
        case "measure":
          font("normal", 8);
          pdf.text(measure, x + pad, textTop);
          break;
        case "weight":
          font("normal", 8);
          pdf.text(row.weight, x + c.width - pad, textTop, { align: "right" });
          break;
        case "service":
          font("normal", 8);
          pdf.text(service, x + pad, textTop);
          break;
        case "serviceCost":
          font("normal", 8);
          pdf.text(row.serviceCost, x + c.width - pad, textTop, {
            align: "right",
          });
          break;
        case "quantity":
          font("normal", 8.5);
          pdf.text(row.quantity, x + c.width / 2, textTop, {
            align: "center",
          });
          break;
        case "status":
          font("normal", 8);
          pdf.text(status, x + pad, textTop);
          break;
        case "location":
          font("normal", 8);
          pdf.text(location, x + pad, textTop);
          break;
      }
    });
    y += rowH;
  }

  // Filas vacías hasta el mínimo, mientras quepan en la página.
  for (let n = model.rows.length; n < MIN_ROWS && y + 7 <= bottomLimit; n++) {
    drawRowFrame(7);
    y += 7;
  }

  // Total del costo de servicio, bajo la tabla.
  if (model.showServiceCost) {
    if (y + 8 > bottomLimit) {
      pdf.addPage();
      y = MARGIN;
    }
    font("bold", 9);
    pdf.text(
      `TOTAL COSTO DE SERVICIO: ${model.totalServiceCost}`,
      right,
      y + 6,
      { align: "right" },
    );
  }

  // --- Pie: fecha, quién lo generó (discreto) y numeración.
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
