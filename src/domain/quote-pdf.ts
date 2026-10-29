import { amountInWords } from "./amount-in-words";
import { formatCents } from "./money";
import {
  formatQuoteDateLong,
  lineTotal,
  QUOTE_PAYMENT_CONDITION_LABELS,
  quoteTotals,
  quoteValidUntil,
  type QuoteLineAmounts,
  type QuotePaymentCondition,
} from "./quote";
import { draftAmounts, type QuoteLineDraft } from "./quote-line";

/**
 * Exportar la cotización en PDF (Paso 14.5), al formato de la cotización en papel de
 * la tienda: fecha y código a la izquierda, logo a la derecha, cliente y contacto,
 * tabla de productos, totales, monto en letras ("Son:") y condiciones. El contenido
 * se arma aquí; el dibujo con jsPDF está en `components/quotes/quote-pdf-draw.ts`.
 */

/** Dirección que se usa si la configuración no tiene una (logo y ciudad de la fecha). */
export const DEFAULT_COMPANY_ADDRESS = "Calle Coronel Inclán 928, Miraflores";

export type QuotePdfCompany = {
  name: string;
  /** "Calle Coronel Inclán 928, Miraflores": el último tramo da la ciudad del encabezado. */
  address: string;
};

export type QuotePdfLine = QuoteLineAmounts & {
  sku: string | null;
  /** Título, variante y personalización ya unidos en una sola descripción. */
  description: string;
};

export type QuotePdfData = {
  company: QuotePdfCompany;
  code: string;
  /** Fecha de emisión en Lima; si aún es borrador, la de hoy (vista previa). */
  issueDate: string;
  validityDays: number;
  /** Forma de pago, fila "Condición:" bajo "Son:". */
  paymentCondition: QuotePaymentCondition;
  /** Tiempo de entrega en días hábiles desde la aprobación. */
  deliveryDays: number;
  clientName: string;
  /** Nombre del contacto; igual al del cliente cuando no se cotiza a un contacto. */
  contactName: string;
  lines: QuotePdfLine[];
  /** Detalles para el cliente (campo "Notas"). */
  notes: string;
  /** Forma de pago, cuentas bancarias, etc. (campo "Condiciones"). */
  terms: string;
};

/** Nombre del archivo, p. ej. `cotizacion-COT-000001.pdf`. */
export function quotePdfFileName(code: string): string {
  return `cotizacion-${code.replace(/[^\w-]+/g, "_")}.pdf`;
}

/** Línea del editor (textos) → línea del PDF (montos y descripción ya armada). */
export function quotePdfLineFromDraft(line: QuoteLineDraft): QuotePdfLine {
  return {
    ...draftAmounts(line),
    sku: line.sku,
    description: [line.title, line.variantTitle, line.customization]
      .map((s) => s.trim())
      .filter(Boolean)
      .join(" · "),
  };
}

/** Último tramo de la dirección de la empresa ("...928, Miraflores" → "Miraflores"). */
function cityFromAddress(address: string): string {
  const parts = address
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.at(-1) ?? "";
}

export type QuotePdfRow = {
  sku: string;
  description: string;
  quantity: string;
  unitPrice: string;
  total: string;
};

export type QuotePdfModel = {
  title: string;
  code: string;
  /** "Miraflores, 17 de agosto de 2026". */
  dateLine: string;
  companyName: string;
  /** Va debajo del logo; `DEFAULT_COMPANY_ADDRESS` si la configuración está vacía. */
  companyAddress: string;
  clientName: string;
  contactName: string;
  rows: QuotePdfRow[];
  subtotal: string;
  /** Null sin descuentos (no se muestra la fila). */
  discount: string | null;
  total: string;
  /** "Son:", el total en letras. */
  amountInWords: string;
  /** "Los precios... tienen una validez de {validityDays} días". */
  validityText: string;
  /** "Al contado", "Al crédito" o "A cuenta". */
  paymentConditionText: string;
  /** "30 días hábiles desde su aprobación". */
  deliveryText: string;
  notes: string;
  terms: string;
  /** Nombre bajo "Atentamente,"; vacío si la empresa no tiene razón social. */
  signer: string;
};

export function quotePdfModel(data: QuotePdfData): QuotePdfModel {
  const totals = quoteTotals(data.lines);
  const rows: QuotePdfRow[] = data.lines.map((line) => ({
    sku: line.sku ?? "",
    description: line.description,
    quantity: String(line.quantity),
    unitPrice: formatCents(line.unitPrice),
    total: formatCents(lineTotal(line)),
  }));
  const validUntil = quoteValidUntil(data.issueDate, data.validityDays);
  const address = data.company.address.trim() || DEFAULT_COMPANY_ADDRESS;

  return {
    title: "COTIZACIÓN",
    code: data.code,
    dateLine: `${cityFromAddress(address)}, ${formatQuoteDateLong(data.issueDate)}`,
    companyName: data.company.name,
    companyAddress: address,
    clientName: data.clientName,
    contactName: data.contactName,
    rows,
    subtotal: formatCents(totals.subtotal),
    discount: totals.discount > 0 ? formatCents(totals.discount) : null,
    total: formatCents(totals.total),
    amountInWords: amountInWords(totals.total),
    validityText: `Los precios que figuran en el presente documento tienen una validez de ${data.validityDays} día${data.validityDays === 1 ? "" : "s"}, hasta el ${formatQuoteDateLong(validUntil)}.`,
    paymentConditionText: QUOTE_PAYMENT_CONDITION_LABELS[data.paymentCondition],
    deliveryText:
      data.deliveryDays === 1
        ? "1 día hábil desde su aprobación"
        : `${data.deliveryDays} días hábiles desde su aprobación`,
    notes: data.notes.trim(),
    terms: data.terms.trim(),
    signer: data.company.name.trim(),
  };
}

/** Mensaje breve para compartir la cotización por WhatsApp (Paso 14.6). */
export function quoteShareMessage(code: string, clientName: string): string {
  const greeting = clientName.trim() ? `Hola ${clientName.trim()}` : "Hola";
  return `${greeting}, te comparto la cotización ${code}. Cualquier consulta, con gusto te ayudamos.`;
}
