import { toDecimalString } from "@/domain/money";
import { isClosedStatus } from "@/domain/piece-state-machine";
import { externalPayments } from "@/domain/shopify-transactions";
import {
  ShopifyUnavailableError,
  ShopifyUserError,
} from "@/server/shopify/errors";
import type { ShopifyGateway } from "@/server/shopify/gateway";
import { toCents } from "@/server/shopify/money";
import type { OrderInput, ShopifyOrder } from "@/server/shopify/types";

import type {
  OrderPayment,
  OrderRestoration,
  RestorationOrderRepository,
} from "./shopify-order";

/**
 * Un pedido de Shopify por pago (pedido del 2026-10-19). En el plan Grow la API no
 * acepta pagos parciales en una orden ya creada, así que cada pago del sistema es su
 * propio pedido, ya pagado: una línea por el monto, con el nombre que fijó la BD
 * ("Adelanto Guía RES-00043 A1", "Saldo Guía RES-00043") como nombre del pedido y
 * de la línea. Los reembolsos se hacen en el pedido del pago que devuelven. Todo se
 * concilia contra lo que ya está en Shopify: repetir el job no cambia nada.
 */

/** Comprador del pedido: la persona, o la empresa (su ubicación) con su contacto (P14). */
export function orderBuyer(
  data: Pick<OrderRestoration, "client" | "contact">,
): Pick<OrderInput, "customerId" | "companyLocationId"> {
  if (data.client.kind === "persona") {
    if (!data.client.shopifyCustomerId) {
      throw new ShopifyUnavailableError("El cliente aún no está en Shopify");
    }
    return { customerId: data.client.shopifyCustomerId };
  }
  if (!data.client.shopifyCompanyLocationId) {
    throw new ShopifyUnavailableError("La empresa aún no está en Shopify");
  }
  if (!data.contact) {
    throw new ShopifyUserError([
      {
        field: null,
        message:
          "La empresa no tiene contactos: agrega uno para crear el pedido en Shopify",
      },
    ]);
  }
  if (!data.contact.shopifyCustomerId) {
    throw new ShopifyUnavailableError("El contacto aún no está en Shopify");
  }
  return {
    customerId: data.contact.shopifyCustomerId,
    companyLocationId: data.client.shopifyCompanyLocationId,
  };
}

/** Etiqueta única del pedido de un pago (para no duplicarlo si un reintento ya lo creó). */
export const paymentOrderTag = (paymentId: string) => `pago-${paymentId}`;

/** Pagos del sistema que tienen (o tendrán) su propio pedido. */
const ownOrderPayments = (data: OrderRestoration) =>
  data.payments.filter(
    (p): p is OrderPayment & { orderTitle: string } =>
      p.kind === "pago" && p.source !== "shopify" && Boolean(p.orderTitle),
  );

/** Todas las piezas que se cobran ya se entregaron (los pedidos quedan preparados). */
export function isFullyDelivered(data: Pick<OrderRestoration, "pieces">) {
  const charged = data.pieces.filter((p) => !isClosedStatus(p.status));
  return charged.length > 0 && charged.every((p) => p.status === "entregada");
}

/** Datos del pedido de un pago: una línea por el monto, ya pagado con su método. */
export function paymentOrderInput(
  data: OrderRestoration,
  payment: OrderPayment & { orderTitle: string },
  appUrl: string,
): OrderInput {
  const amount = toDecimalString(payment.amountCents);
  return {
    name: payment.orderTitle,
    ...orderBuyer(data),
    lines: [{ title: payment.orderTitle, price: amount, quantity: 1 }],
    tags: ["restauracion", data.code, paymentOrderTag(payment.id)],
    note: `Guía ${data.code}: ${new URL(`/restauraciones/${data.id}`, appUrl)}`,
    payments: [{ gateway: payment.gateway, amount }],
  };
}

/** Las transacciones que aún no se conocen las creó el sistema: se recuerdan. */
async function rememberOwnTransactions(
  repo: RestorationOrderRepository,
  gateway: ShopifyGateway,
  restorationId: string,
  orderId: string,
) {
  const known = await repo.knownTransactions(restorationId);
  const ids = (await gateway.getOrderTransactions(orderId))
    .map((t) => t.id)
    .filter((id) => !known.has(id));
  if (ids.length > 0) await repo.rememberTransactions(restorationId, ids);
}

const unfulfilledLines = (order: Pick<ShopifyOrder, "lines">) =>
  order.lines.filter((l) => !l.fulfilled).map((l) => l.id);

/**
 * Crea el pedido de cada pago que aún no lo tiene (antes lo busca por su etiqueta: un
 * reintento tras un corte no lo duplica), reembolsa en su pedido lo que el admin
 * devolvió y agrega al registro los reembolsos hechos directamente en Shopify. Los
 * pagos hechos en Shopify ya no entran al registro.
 */
export async function syncPaymentOrders(
  repo: RestorationOrderRepository,
  gateway: ShopifyGateway,
  data: OrderRestoration,
  appUrl: string,
) {
  const delivered = isFullyDelivered(data);
  let created = 0;
  for (const payment of ownOrderPayments(data)) {
    if (payment.orderId) continue;
    let order =
      (await gateway.findOrderByTag(paymentOrderTag(payment.id))) ??
      (await gateway.createOrder(paymentOrderInput(data, payment, appUrl)));
    // Si la guía ya se entregó, el pedido nace preparado.
    const pending = unfulfilledLines(order);
    if (delivered && pending.length > 0) {
      order = await gateway.fulfillLines(order.id, pending);
    }
    await repo.savePaymentOrder(payment.id, { id: order.id, name: order.name });
    payment.orderId = order.id;
    payment.synced = true;
    await rememberOwnTransactions(repo, gateway, data.id, order.id);
    created += 1;
  }

  let refunded = 0;
  for (const refund of data.payments) {
    if (refund.kind !== "reembolso" || refund.source === "shopify") continue;
    if (refund.synced) continue;
    const target = data.payments.find((p) => p.id === refund.refundedPaymentId);
    // Sin pedido del pago (p. ej., un reembolso anterior a este cambio): queda solo
    // en el sistema.
    if (target?.orderId) {
      await gateway.refundPayment(target.orderId, {
        // Con el método del pago que se devuelve: es el que tiene el pedido.
        gateway: target.gateway,
        amount: toDecimalString(refund.amountCents),
        idempotencyKey: `refund:${refund.id}`,
        note: "Reembolso registrado en el sistema",
      });
      await rememberOwnTransactions(repo, gateway, data.id, target.orderId);
      refunded += 1;
    }
    await repo.markPaymentsSynced([refund.id]);
    refund.synced = true;
  }

  // Reembolsos hechos en Shopify (panel o POS) sobre el pedido de un pago.
  const known = await repo.knownTransactions(data.id);
  const imported = [];
  for (const payment of ownOrderPayments(data)) {
    if (!payment.orderId) continue;
    const transactions = (
      await gateway.getOrderTransactions(payment.orderId)
    ).map((t) => ({ ...t, amountCents: toCents(t.amount) }));
    for (const p of externalPayments(transactions, known)) {
      if (p.kind === "reembolso")
        imported.push({ ...p, refundedPaymentId: payment.id });
    }
  }
  if (imported.length > 0) await repo.importPayments(data.id, imported);

  return { created, refunded, imported: imported.length };
}

/** Entregada toda la guía, los pedidos de sus pagos quedan preparados. */
export async function fulfillPaymentOrders(
  gateway: ShopifyGateway,
  data: OrderRestoration,
) {
  if (!isFullyDelivered(data)) return 0;
  let fulfilled = 0;
  for (const payment of ownOrderPayments(data)) {
    if (!payment.orderId) continue;
    const order = await gateway.getOrder(payment.orderId);
    const pending = order ? unfulfilledLines(order) : [];
    if (pending.length === 0) continue;
    await gateway.fulfillLines(payment.orderId, pending);
    fulfilled += 1;
  }
  return fulfilled;
}
