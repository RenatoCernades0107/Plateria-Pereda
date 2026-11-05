import { amountInWords } from "./amount-in-words";
import type { DocumentType } from "./documents";
import { formatCents } from "./money";
import { formatPhone } from "./phone";
import {
  formatQuoteDateLong,
  lineTotal,
  quotePaymentConditionText,
  quoteTotals,
  quoteValidUntil,
  type QuoteLineAmounts,
  type QuotePaymentCondition,
} from "./quote";
import {
  QUOTE_PDF_MISSING_ISSUER,
  quoteIssuerPdfLines,
  type QuoteIssuer,
} from "./quote-issuers";
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
  /** Foto de la fila: la referencial subida o, si no hay, la de Shopify. */
  image: string | null;
};

/** Documento del cliente en el PDF: RUC de la empresa o el documento de la persona. */
export type QuotePdfClientDocument = { type: DocumentType; number: string };

/** Etiqueta corta del documento en el PDF. */
const PDF_DOCUMENT_LABELS: Record<DocumentType, string> = {
  dni: "DNI",
  ce: "C.E.",
  pasaporte: "Pasaporte",
  ruc: "RUC",
};

export type QuotePdfData = {
  company: QuotePdfCompany;
  code: string;
  /** Fecha de emisión en Lima; si aún es borrador, la de hoy (vista previa). */
  issueDate: string;
  validityDays: number;
  /** Forma de pago, fila "Condición:" bajo "Son:". */
  paymentCondition: QuotePaymentCondition;
  /** Días de crédito («Crédito a N días»); null si no es crédito. */
  creditDays: number | null;
  /** Sucursal que emite: razón social, RUC y cuenta. Sin ella no se genera el PDF. */
  issuer: QuoteIssuer | null;
  /** Tiempo de entrega en días hábiles desde la aprobación. */
  deliveryDays: number;
  clientName: string;
  /** Nombre del contacto; igual al del cliente cuando no se cotiza a un contacto. */
  contactName: string;
  /** RUC de la empresa o documento de la persona; null si no tiene (no se muestra). */
  clientDocument: QuotePdfClientDocument | null;
  /** Teléfono (E.164) del contacto o del cliente; null si no tiene (no se muestra). */
  phone: string | null;
  lines: QuotePdfLine[];
  /** Suma el IGV (18 %) a subtotal − descuentos (casilla del formulario). */
  applyIgv: boolean;
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
    image: line.referenceImageUrl ?? line.imageUrl,
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
  /** URL de la foto de la fila (se descarga al dibujar); null sin foto. */
  image: string | null;
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
  /** "RUC: 20…" o "DNI: 1234…"; null si el cliente no tiene documento. */
  clientDocumentLine: string | null;
  contactName: string;
  /** "+51 987 654 321"; null si no hay teléfono. */
  phone: string | null;
  rows: QuotePdfRow[];
  subtotal: string;
  /** Null sin descuentos (no se muestra la fila). */
  discount: string | null;
  /** Null si la cotización no suma IGV (no se muestra la fila). */
  igv: string | null;
  /** Lo que paga el cliente (con IGV si se suma). */
  total: string;
  /** "Son:", el total en letras. */
  amountInWords: string;
  /** "Los precios... tienen una validez de {validityDays} días". */
  validityText: string;
  /** "Al contado", "Crédito a 30 días" o "A cuenta". */
  paymentConditionText: string;
  /** "30 días hábiles desde su aprobación". */
  deliveryText: string;
  notes: string;
  terms: string;
  /** Razón social, RUC y cuenta de la sucursal, encima de "Atentamente,". */
  issuerLines: string[];
  /** Nombre bajo "Atentamente,"; vacío si la empresa no tiene razón social. */
  signer: string;
};

/** El PDF necesita la sucursal (sus cuentas); si falta, lanza este error. */
export class QuotePdfMissingIssuerError extends Error {
  constructor() {
    super(QUOTE_PDF_MISSING_ISSUER);
    this.name = "QuotePdfMissingIssuerError";
  }
}

export function quotePdfModel(data: QuotePdfData): QuotePdfModel {
  if (!data.issuer) throw new QuotePdfMissingIssuerError();
  const totals = quoteTotals(data.lines, data.applyIgv);
  const rows: QuotePdfRow[] = data.lines.map((line) => ({
    image: line.image,
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
    clientDocumentLine: data.clientDocument?.number.trim()
      ? `${PDF_DOCUMENT_LABELS[data.clientDocument.type]}: ${data.clientDocument.number.trim()}`
      : null,
    contactName: data.contactName,
    phone: data.phone ? formatPhone(data.phone) : null,
    rows,
    subtotal: formatCents(totals.subtotal),
    discount: totals.discount > 0 ? formatCents(totals.discount) : null,
    igv: data.applyIgv ? formatCents(totals.igv) : null,
    total: formatCents(totals.total),
    amountInWords: amountInWords(totals.total),
    validityText: `Los precios que figuran en el presente documento tienen una validez de ${data.validityDays} día${data.validityDays === 1 ? "" : "s"}, hasta el ${formatQuoteDateLong(validUntil)}.`,
    paymentConditionText: quotePaymentConditionText(
      data.paymentCondition,
      data.creditDays,
    ),
    deliveryText:
      data.deliveryDays === 1
        ? "1 día hábil desde su aprobación"
        : `${data.deliveryDays} días hábiles desde su aprobación`,
    notes: data.notes.trim(),
    terms: data.terms.trim(),
    issuerLines: quoteIssuerPdfLines(data.issuer),
    signer: data.company.name.trim(),
  };
}

/** Mensaje breve para compartir la cotización por WhatsApp (Paso 14.6). */
export function quoteShareMessage(code: string, clientName: string): string {
  const greeting = clientName.trim() ? `Hola ${clientName.trim()}` : "Hola";
  return `${greeting}, te comparto la cotización ${code}. Cualquier consulta, con gusto te ayudamos.`;
}
