import { formatQuoteDate, QUOTE_STATUS_LABELS } from "./quote";
import type { QuoteDisplayStatus } from "./quote";

/**
 * PDF para taller de una selección de cotizaciones (pedido del 2026-11-06): como la
 * guía para taller de las restauraciones, pero con todo lo que el taller necesita
 * para fabricar cada producto personalizado (foto, SKU, producto y variante,
 * cantidad y personalización). Sin precios ni datos de contacto del cliente. Aquí se
 * arma el contenido; el dibujo con jsPDF está en
 * `components/quotes/quote-workshop-pdf-draw.ts`.
 */

export type WorkshopQuoteLine = {
  id: string;
  title: string;
  /** Vacío si el producto no tiene variantes. */
  variantTitle: string;
  sku: string | null;
  customization: string;
  quantity: number;
  /** Foto de la fila: la referencial subida o, si no hay, la de Shopify. */
  image: string | null;
};

export type WorkshopQuote = {
  id: string;
  code: string;
  status: QuoteDisplayStatus;
  clientName: string;
  issueDate: string | null;
  /** Fecha en que el taller (proveedor) debe entregar; null si no se fijó. */
  supplierDeliveryDate: string | null;
  /** Fecha de entrega al cliente; null si no se fijó. */
  deliveryDate: string | null;
  /** Notas de la cotización (detalles del pedido). */
  notes: string;
  lines: WorkshopQuoteLine[];
};

export type WorkshopPdfRow = {
  /** Clave de la foto en el mapa de imágenes (id de la línea). */
  id: string;
  number: number;
  sku: string;
  quantity: string;
  product: string;
  variant: string;
  customization: string;
};

export type WorkshopPdfSection = {
  code: string;
  clientName: string;
  /** "Entrega taller: 20/11/2026" o null. */
  deadline: string | null;
  /** Línea de datos bajo la barra: estado, emisión, entrega al cliente, productos. */
  info: [label: string, value: string][];
  rows: WorkshopPdfRow[];
  notes: string;
};

export type WorkshopPdfModel = {
  title: string;
  /** Recuadro de la esquina. */
  meta: [label: string, value: string][];
  sections: WorkshopPdfSection[];
  /** Pie de cada página (p. ej. "Cotizaciones para taller · 06/11/2026"). */
  footerLabel: string;
};

/** Nombre del archivo: `taller-COT-000012.pdf` o `taller-cotizaciones-2026-11-06.pdf`. */
export function quoteWorkshopPdfFileName(
  codes: readonly string[],
  today: string,
): string {
  const name =
    codes.length === 1 ? codes[0]! : `cotizaciones-${today.slice(0, 10)}`;
  return `taller-${name.replace(/[^\w-]+/g, "_")}.pdf`;
}

const units = (n: number) => (n === 1 ? "1 unidad" : `${n} unidades`);

/** `today` es la fecha de Lima en ISO (`2026-11-06`). */
export function quoteWorkshopPdfModel(
  quotes: readonly WorkshopQuote[],
  today: string,
): WorkshopPdfModel {
  const totalUnits = quotes
    .flatMap((q) => q.lines)
    .reduce((sum, l) => sum + l.quantity, 0);
  return {
    title: "ORDEN PARA TALLER",
    meta: [
      ["Fecha", formatQuoteDate(today)],
      ["Cotizaciones", String(quotes.length)],
      ["Unidades", String(totalUnits)],
    ],
    sections: quotes.map((q) => {
      const qtyTotal = q.lines.reduce((sum, l) => sum + l.quantity, 0);
      return {
        code: q.code,
        clientName: q.clientName.trim(),
        deadline: q.supplierDeliveryDate
          ? `Entrega taller: ${formatQuoteDate(q.supplierDeliveryDate)}`
          : null,
        info: [
          ["Estado", QUOTE_STATUS_LABELS[q.status]],
          ...(q.issueDate
            ? ([["Emitida", formatQuoteDate(q.issueDate)]] as [
                string,
                string,
              ][])
            : []),
          ...(q.deliveryDate
            ? ([["Entrega al cliente", formatQuoteDate(q.deliveryDate)]] as [
                string,
                string,
              ][])
            : []),
          ["Productos", `${q.lines.length} (${units(qtyTotal)})`],
        ],
        rows: q.lines.map((l, i) => ({
          id: l.id,
          number: i + 1,
          sku: l.sku?.trim() || "—",
          quantity: String(l.quantity),
          product: l.title.trim(),
          variant: l.variantTitle.trim(),
          customization: l.customization.trim(),
        })),
        notes: q.notes.trim(),
      };
    }),
    footerLabel: `Orden para taller · ${formatQuoteDate(today)}`,
  };
}
