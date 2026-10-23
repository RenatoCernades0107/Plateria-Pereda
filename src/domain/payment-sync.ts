import type { Cents } from "./money";
import type { PaymentKind } from "./payments";

/**
 * Envío de los pagos del sistema a la orden de piezas de Shopify de las guías antiguas
 * (Paso 11.2, §7.5, P43; las nuevas tienen un pedido por pago, `payment-orders.ts`).
 * En el plan Grow la API no acepta pagos parciales en una orden ya creada, así que se
 * concilia: si el sistema ya cubrió el total se registra el pago completo; si se
 * reembolsó más de lo que Shopify cree cobrado se reembolsa la diferencia; los pagos
 * intermedios esperan. Conciliar contra lo que Shopify ya tiene hace que repetir el
 * job no cambie nada.
 */

export type SyncPayment = {
  id: string;
  kind: PaymentKind;
  amountCents: Cents;
  /** Nombre del método en Shopify (o el del sistema). */
  gateway: string;
  /** Ya llegó a Shopify. */
  synced: boolean;
};

/** Pagados − reembolsados. */
export function netPaid(payments: readonly SyncPayment[]): Cents {
  return payments.reduce(
    (sum, p) => sum + (p.kind === "pago" ? p.amountCents : -p.amountCents),
    0,
  );
}

const lastOf = (payments: readonly SyncPayment[], kind: PaymentKind) =>
  payments.filter((p) => p.kind === kind).at(-1);

export type PaymentSyncPlan =
  | { kind: "none"; markSynced: boolean }
  | { kind: "record_full"; gateway: string; markSynced: true }
  | { kind: "refund"; amountCents: Cents; gateway: string; markSynced: true };

/**
 * Qué hacer con la orden ya creada. `markSynced`: los pagos pendientes quedan
 * enviados (Shopify ya refleja lo pagado en el sistema, o el pago completo los cubre).
 */
export function planPaymentSync(input: {
  payments: readonly SyncPayment[];
  /** Total de la restauración en el sistema. */
  totalCents: Cents;
  shopify: { receivedCents: Cents; outstandingCents: Cents };
}): PaymentSyncPlan {
  const paid = netPaid(input.payments);
  const { receivedCents, outstandingCents } = input.shopify;
  const pending = input.payments.filter((p) => !p.synced);

  if (paid > 0 && paid >= input.totalCents && outstandingCents > 0) {
    const last = lastOf(pending, "pago") ?? lastOf(input.payments, "pago")!;
    return { kind: "record_full", gateway: last.gateway, markSynced: true };
  }
  if (receivedCents > Math.max(paid, 0)) {
    const last =
      lastOf(pending, "reembolso") ?? lastOf(input.payments, "reembolso");
    return {
      kind: "refund",
      amountCents: receivedCents - Math.max(paid, 0),
      gateway: last?.gateway ?? lastOf(input.payments, "pago")?.gateway ?? "",
      markSynced: true,
    };
  }
  return { kind: "none", markSynced: receivedCents === paid };
}
