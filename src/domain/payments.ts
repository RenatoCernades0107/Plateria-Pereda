import type { Cents, PaymentStatus, PaymentType } from "./money";

/**
 * Pagos de una restauración (§7.5, P28 y P29 respondidas el 2026-10-12). El registro
 * del sistema manda: pagado = pagos − reembolsos y saldo = total − pagado.
 */

export const PAYMENT_KINDS = ["pago", "reembolso"] as const;
export type PaymentKind = (typeof PAYMENT_KINDS)[number];

/**
 * Estado de pago (P29): Pendiente (nada pagado), Parcial, Pagado (pagado ≥ total) y
 * Reembolsado (se devolvió todo lo que se había pagado). Con total 0 y nada pagado
 * queda Pendiente. Igual que `private.payment_status_for()` en la BD.
 */
export function derivePaymentStatus(
  total: Cents,
  paid: Cents,
  refunded: Cents = 0,
): PaymentStatus {
  if (paid <= 0) return refunded > 0 ? "reembolsado" : "pendiente";
  return paid >= total ? "pagado" : "parcial";
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
