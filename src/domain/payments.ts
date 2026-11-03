import type { Cents, PaymentStatus, PaymentType } from "./money";

/**
 * Pagos de una restauración (§7.5, P28 y P29 respondidas el 2026-10-12). El registro
 * del sistema manda: pagado = pagos − reembolsos y saldo = total − pagado.
 */

export const PAYMENT_KINDS = ["pago", "reembolso"] as const;
export type PaymentKind = (typeof PAYMENT_KINDS)[number];

export const PAYMENT_KIND_LABELS: Record<PaymentKind, string> = {
  pago: "Pago",
  reembolso: "Reembolso",
};

/** Lo que hace falta de un pago para saber su estado en Shopify. */
export type PaymentShopifyState = {
  source: "sistema" | "shopify";
  /** Queda solo en el sistema (sin pedido en Shopify). */
  skipShopify: boolean;
  syncedToShopify: boolean;
  orderTitle: string | null;
  orderName: string | null;
};

/** Estado de envío a Shopify de un pago (§7.5); con su pedido, su descripción. */
export function paymentShopifyLabel(p: PaymentShopifyState): string {
  if (p.source === "shopify") return "Hecho en Shopify";
  if (p.skipShopify) return "Solo en el sistema";
  if (p.orderName) return p.orderTitle ?? p.orderName;
  return p.syncedToShopify ? "En Shopify" : "Pendiente de envío";
}

/**
 * Estado de pago (P29): Pendiente (nada pagado), Parcial, Pagado (pagado ≥ total) y
 * Reembolsado (se devolvió todo lo que se había pagado). Con total 0 y nada pagado
 * queda Pendiente; con total 0 y algo pagado (el adelanto antes de los precios), Parcial. Igual que `private.payment_status_for()` en la BD.
 */
export function derivePaymentStatus(
  total: Cents,
  paid: Cents,
  refunded: Cents = 0,
): PaymentStatus {
  if (paid <= 0) return refunded > 0 ? "reembolsado" : "pendiente";
  // Sin total (piezas aún sin precio, D58) lo cobrado es a cuenta: Parcial.
  return total > 0 && paid >= total ? "pagado" : "parcial";
}

export type SuggestedPayment = {
  /** "adelanto" mientras falte el adelanto esperado; si no, "saldo". */
  kind: "adelanto" | "saldo";
  amount: Cents;
};

/**
 * Monto sugerido al registrar un pago (§7.5): lo que falta del adelanto esperado
 * (todo al contado, el % a cuenta, P28) y, cubierto el adelanto, el saldo. Null si
 * no queda nada por cobrar.
 */
export function suggestedPayment(r: {
  paymentType: PaymentType;
  totalCents: Cents;
  paidCents: Cents;
  expectedDepositCents: Cents;
}): SuggestedPayment | null {
  const balance = r.totalCents - r.paidCents;
  if (balance <= 0) return null;
  const depositMissing = r.expectedDepositCents - r.paidCents;
  if (r.paymentType === "a_cuenta" && depositMissing > 0)
    return { kind: "adelanto", amount: Math.min(depositMissing, balance) };
  return { kind: "saldo", amount: balance };
}
