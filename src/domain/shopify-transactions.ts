import type { Cents } from "./money";
import type { PaymentKind } from "./payments";

/**
 * Pagos hechos directamente en Shopify (POS o panel) y webhooks de la orden (Paso
 * 11.3). Las transacciones se leen de Shopify al procesar, no del webhook: así un
 * webhook duplicado o desordenado no cambia el resultado.
 */

export type OrderTransaction = {
  id: string;
  /** SALE, CAPTURE, REFUND, AUTHORIZATION, VOID… */
  kind: string;
  /** SUCCESS, FAILURE, PENDING, ERROR… */
  status: string;
  gateway: string;
  amountCents: Cents;
  processedAt: string;
};

export type ImportedPayment = {
  transactionId: string;
  kind: PaymentKind;
  amountCents: Cents;
  methodName: string;
  /** Fecha en Lima (AAAA-MM-DD). */
  paidOn: string;
};

const GATEWAY_LABELS: Record<string, string> = {
  cash: "Efectivo",
  manual: "Manual (Shopify)",
  shopify_payments: "Tarjeta (Shopify Payments)",
};

/** Fecha en Lima de un instante ISO. */
export function limaDate(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(
    new Date(iso),
  );
}

/**
 * Transacción → pago del registro: venta o captura exitosa = pago; reembolso exitoso
 * = reembolso. Las fallidas, pendientes, autorizaciones y anulaciones no cuentan.
 */
export function transactionToPayment(
  tx: OrderTransaction,
): ImportedPayment | null {
  if (tx.status !== "SUCCESS" || tx.amountCents <= 0) return null;
  const kind: PaymentKind | null =
    tx.kind === "SALE" || tx.kind === "CAPTURE"
      ? "pago"
      : tx.kind === "REFUND"
        ? "reembolso"
        : null;
  if (!kind) return null;
  return {
    transactionId: tx.id,
    kind,
    amountCents: tx.amountCents,
    methodName: (GATEWAY_LABELS[tx.gateway] ?? tx.gateway) || "Shopify",
    paidOn: limaDate(tx.processedAt),
  };
}

/** Pagos hechos en Shopify que el registro aún no tiene (por id de transacción). */
export function externalPayments(
  transactions: readonly OrderTransaction[],
  known: ReadonlySet<string>,
): ImportedPayment[] {
  return transactions
    .filter((tx) => !known.has(tx.id))
    .map(transactionToPayment)
    .filter((p): p is ImportedPayment => p !== null);
}

const gid = (type: string, value: unknown): string | null =>
  typeof value === "number" ||
  (typeof value === "string" && /^\d+$/.test(value))
    ? `gid://shopify/${type}/${value}`
    : typeof value === "string" && value.startsWith(`gid://shopify/${type}/`)
      ? value
      : null;

/** Orden de un webhook: `orders/*` trae la orden; transacciones y reembolsos, `order_id`. */
export function webhookOrderId(topic: string, payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  if (topic.startsWith("orders/"))
    return gid("Order", p.admin_graphql_api_id) ?? gid("Order", p.id);
  return gid("Order", p.order_id);
}

export type OrderCustomer = {
  customerId: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
};

const text = (v: unknown) => (typeof v === "string" ? v : null);

/**
 * Cliente de la orden en `orders/updated` (D31). Null si no trae cliente o si la
 * orden es de una empresa (el comprador es su contacto: no cambia el cliente).
 */
export function webhookOrderCustomer(payload: unknown): OrderCustomer | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  if (p.company) return null;
  const c = p.customer as Record<string, unknown> | null | undefined;
  if (!c || typeof c !== "object") return null;
  const customerId =
    gid("Customer", c.admin_graphql_api_id) ?? gid("Customer", c.id);
  if (!customerId) return null;
  return {
    customerId,
    firstName: text(c.first_name),
    lastName: text(c.last_name),
    email: text(c.email),
    phone: text(c.phone),
  };
}
