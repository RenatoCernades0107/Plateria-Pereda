/**
 * Sucursales de cotización (pedido del 2026-11-04): quién emite la cotización, con su
 * razón social, DNI/RUC y cuenta bancaria. Salen en el PDF encima de «Atentamente,».
 * Son un catálogo aparte de las sucursales de los pagos (`branches`).
 */

/** Pestaña de Configuración donde el admin las gestiona. */
export const QUOTE_ISSUERS_HREF = "/configuracion/sucursales-cotizacion";
export const QUOTE_ISSUERS_TITLE = "Sucursales de cotización";

export const QUOTE_ISSUER_DOCUMENT_TYPES = ["ruc", "dni"] as const;
export type QuoteIssuerDocumentType =
  (typeof QUOTE_ISSUER_DOCUMENT_TYPES)[number];

export const QUOTE_ISSUER_DOCUMENT_LABELS: Record<
  QuoteIssuerDocumentType,
  string
> = { ruc: "RUC", dni: "DNI" };

export type QuoteIssuer = {
  id: string;
  /** Nombre corto con que se elige, p. ej. "PEREDA SAC". */
  name: string;
  /** Razón social (RUC) o titular de la cuenta (DNI). */
  legalName: string;
  documentType: QuoteIssuerDocumentType;
  documentNumber: string;
  /** "Banco de Crédito (BCP)". */
  bankName: string;
  /** "CTA CTE soles", "CTA AHORRO soles". */
  accountLabel: string;
  accountNumber: string;
  cci: string;
  active: boolean;
};

/**
 * Líneas del PDF encima de «Atentamente,». Con RUC: razón social, RUC, banco y cuenta.
 * Con DNI (una persona, p. ej. CARMEN): solo el banco y la cuenta.
 */
export function quoteIssuerPdfLines(issuer: QuoteIssuer): string[] {
  const bank = [
    issuer.bankName.trim(),
    `${issuer.accountLabel.trim()}: ${issuer.accountNumber}; CCI: ${issuer.cci}`,
  ];
  if (issuer.documentType !== "ruc") return bank;
  return [
    `Razón social: ${issuer.legalName.trim()}`,
    `RUC: ${issuer.documentNumber}`,
    ...bank,
  ];
}

/** Nombre en el selector: "PEREDA SAC · RUC 20557169866". */
export function quoteIssuerOptionLabel(issuer: QuoteIssuer): string {
  return `${issuer.name} · ${QUOTE_ISSUER_DOCUMENT_LABELS[issuer.documentType]} ${issuer.documentNumber}${issuer.active ? "" : " (inactiva)"}`;
}

/** Error que se muestra al intentar generar el PDF sin sucursal. */
export const QUOTE_PDF_MISSING_ISSUER =
  "Elige la sucursal de la cotización antes de generar el PDF.";
