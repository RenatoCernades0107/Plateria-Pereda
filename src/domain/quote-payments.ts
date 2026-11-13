import { derivePaymentStatus } from "./payments";
import type { Cents, PaymentStatus } from "./money";

/**
 * Pagos de una cotización aceptada o facturada (pedido del 2026-11-11): sin Shopify,
 * con el N.º de factura de cada pago. Pagado = suma de pagos; saldo = total − pagado.
 */

export const MAX_INVOICE_NUMBER_LENGTH = 30;

/** Estado de pago de la cotización: Pendiente, Parcial o Pagado (no hay reembolsos). */
export function quotePaymentStatus(total: Cents, paid: Cents): PaymentStatus {
  return derivePaymentStatus(total, paid);
}

export function quoteBalance(total: Cents, paid: Cents): Cents {
  return Math.max(total - paid, 0);
}

/**
 * N.º de factura limpio (sin espacios sobrantes). Vacío = sin factura (null). Un número
 * demasiado largo es un error.
 */
export function parseInvoiceNumber(
  raw: string,
): { value: string | null } | { error: string } {
  const value = raw.trim().replace(/\s+/g, " ");
  if (value.length === 0) return { value: null };
  if (value.length > MAX_INVOICE_NUMBER_LENGTH) {
    return {
      error: `El número de factura admite hasta ${MAX_INVOICE_NUMBER_LENGTH} caracteres.`,
    };
  }
  return { value };
}
