import type { Cents } from "./money";
import type { PaymentKind } from "./payments";

/**
 * Envío de los pagos del sistema a la orden de Shopify (Paso 11.2, §7.5, P43). En el
 * plan Grow la API no acepta pagos parciales en una orden ya creada, así que:
 *   * los pagos registrados antes de la orden van incluidos al crearla;
 *   * con la orden creada se concilia: si el sistema ya cubrió el total se registra
 *     el pago completo; si se reembolsó más de lo que Shopify cree cobrado se
 *     reembolsa la diferencia; los pagos intermedios esperan.
 * Conciliar contra lo que Shopify ya tiene hace que repetir el job no cambie nada.
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

/**
 * Transacciones con las que se crea la orden: cada pago con su método o, si hubo
 * reembolsos, lo neto con el método del último pago. Nunca más que el total de la
 * orden (Shopify lo rechaza).
 */
export function orderCreatePayments(
  payments: readonly SyncPayment[],
  orderTotal: Cents,
): { gateway: string; amountCents: Cents }[] {
  const pending = payments.filter((p) => !p.synced);
  const net = netPaid(pending);
  if (net <= 0) return [];
  const list = pending.some((p) => p.kind === "reembolso")
    ? [{ gateway: lastOf(pending, "pago")!.gateway, amountCents: net }]
    : pending.map((p) => ({ gateway: p.gateway, amountCents: p.amountCents }));
  let room = orderTotal;
  return list.flatMap((p) => {
    const amountCents = Math.min(p.amountCents, room);
    room -= amountCents;
    return amountCents > 0 ? [{ ...p, amountCents }] : [];
  });
}

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
