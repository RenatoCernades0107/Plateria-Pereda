import { toDecimalString, type Cents } from "@/domain/money";
import { planPaymentSync, type SyncPayment } from "@/domain/payment-sync";
import { isClosedStatus, type PieceStatus } from "@/domain/piece-state-machine";
import {
  externalPayments,
  type ImportedPayment,
} from "@/domain/shopify-transactions";
import type { RestorationKind } from "@/domain/restoration-status";
import {
  linesToFulfill,
  orderLinesChange,
  pieceLineIds,
  type OrderLine,
  type OrderPiece as DomainOrderPiece,
} from "@/domain/shopify-order";
import type { Json } from "@/lib/supabase/database.types";
import {
  ShopifyUnavailableError,
  ShopifyUserError,
} from "@/server/shopify/errors";
import type { ShopifyGateway } from "@/server/shopify/gateway";
import { toCents } from "@/server/shopify/money";
import type { ShopifyOrder } from "@/server/shopify/types";
import type { ShopifyJobHandler } from "@/server/shopify-sync/handlers";

import {
  fulfillPaymentOrders,
  isFullyDelivered,
  syncPaymentOrders,
} from "./payment-orders";

export { orderBuyer } from "./payment-orders";

/**
 * Restauraciones en Shopify. Desde el 2026-10-19 cada pago es su propio pedido, ya
 * pagado (`payment-orders.ts`): ya no se crea la orden con las piezas. Las guías que
 * ya la tienen (una línea personalizada por pieza, "Restauración RES-00001-1", D30)
 * se siguen conciliando contra ella: `order.edit` (9.2), `order.fulfill` (9.3) y los
 * pagos con `payment.sync` (11.2).
 */

export type OrderPiece = {
  id: string;
  code: string;
  number: number;
  /**
   * Importe de la pieza (precio × cantidad): su línea va con cantidad 1. null: precio
   * de venta sin asignar (D58).
   */
  priceCents: Cents | null;
  status: PieceStatus;
  approvedAt: string | null;
};

/** Pago del sistema o de Shopify, con su pedido propio (un pedido por pago). */
export type OrderPayment = SyncPayment & {
  /** Sin dato: del sistema. */
  source?: "sistema" | "shopify";
  /** Nombre del pedido del pago ("Adelanto Guía RES-00043 A1"); null en guías antiguas. */
  orderTitle?: string | null;
  /** Pedido de Shopify del pago, cuando ya se creó. */
  orderId?: string | null;
  /** Reembolso: el pago que devuelve. */
  refundedPaymentId?: string | null;
};

export type OrderRestoration = {
  id: string;
  code: string;
  /** Orden con las piezas (guías antiguas); null: un pedido por pago. */
  shopifyOrderId: string | null;
  shopifyOrderName: string | null;
  /** Tipo de guía (sin dato: normal). Las internas u observadas no se cobran. */
  restorationKind?: RestorationKind;
  pieces: OrderPiece[];
  client: {
    kind: "persona" | "empresa";
    shopifyCustomerId: string | null;
    shopifyCompanyLocationId: string | null;
  };
  /**
   * Contacto de la restauración o, en una empresa sin contacto elegido, su primer
   * contacto activo (el pedido necesita un comprador). null si la empresa no tiene.
   */
  contact: { shopifyCustomerId: string | null } | null;
  /** Pagos y reembolsos, en orden (11.2). */
  payments: OrderPayment[];
};

/** Lectura y escritura de la restauración para el handler (con la clave secreta). */
export interface RestorationOrderRepository {
  getOrderData(restorationId: string): Promise<OrderRestoration | null>;
  /** Guarda el pedido de Shopify de un pago (y lo da por enviado). */
  savePaymentOrder(
    paymentId: string,
    order: { id: string; name: string },
  ): Promise<void>;
  /** Actualiza el id de línea de las piezas tras editar la orden (null: ya no está). */
  saveLineIds(
    lines: { pieceId: string; lineId: string | null }[],
  ): Promise<void>;
  /** Marca los pagos como ya enviados a Shopify. */
  markPaymentsSynced(paymentIds: string[]): Promise<void>;
  /** Transacciones de la orden ya contadas (del sistema o importadas, 11.3). */
  knownTransactions(restorationId: string): Promise<Set<string>>;
  /** Recuerda transacciones que creó el sistema (no son pagos hechos en Shopify). */
  rememberTransactions(restorationId: string, ids: string[]): Promise<void>;
  /** Agrega al registro los pagos hechos en Shopify (sin duplicar). */
  importPayments(
    restorationId: string,
    payments: (ImportedPayment & { refundedPaymentId?: string })[],
  ): Promise<void>;
}

export const lineTitle = (pieceCode: string) => `Restauración ${pieceCode}`;

type BillablePiece = OrderPiece & { priceCents: Cents };

/** Piezas que se cobran, en orden (una sin precio se omite en vez de cobrarla en 0). */
export function billablePieces(pieces: readonly OrderPiece[]): BillablePiece[] {
  return pieces
    .filter(
      (p): p is BillablePiece =>
        !isClosedStatus(p.status) && p.priceCents !== null,
    )
    .sort((a, b) => a.number - b.number);
}

/** Total que se cobra: las piezas que van a la orden. */
export function chargedTotal(data: OrderRestoration): Cents {
  return billablePieces(data.pieces).reduce((sum, p) => sum + p.priceCents, 0);
}

/** Transacciones actuales de la orden, en céntimos. */
async function orderTransactions(gateway: ShopifyGateway, orderId: string) {
  return (await gateway.getOrderTransactions(orderId)).map((t) => ({
    ...t,
    amountCents: toCents(t.amount),
  }));
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

/**
 * Pagos hechos directamente en Shopify (POS o panel, 11.3): las transacciones que el
 * sistema no conoce se agregan al registro. Se leen de Shopify, no del webhook.
 */
async function importExternalPayments(
  repo: RestorationOrderRepository,
  gateway: ShopifyGateway,
  restorationId: string,
  orderId: string,
) {
  const imported = externalPayments(
    await orderTransactions(gateway, orderId),
    await repo.knownTransactions(restorationId),
  );
  if (imported.length > 0) await repo.importPayments(restorationId, imported);
  return imported.length;
}

/**
 * Concilia los pagos del sistema con la orden de piezas (11.2): pago completo,
 * reembolso de la diferencia o nada (pagos intermedios). Repetirlo no cambia nada.
 */
async function syncPayments(
  repo: RestorationOrderRepository,
  gateway: ShopifyGateway,
  current: OrderRestoration,
  orderId: string,
) {
  // Primero lo hecho directamente en Shopify (11.3), así no se toma por propio.
  const imported = await importExternalPayments(
    repo,
    gateway,
    current.id,
    orderId,
  );
  const data =
    imported > 0 ? ((await repo.getOrderData(current.id)) ?? current) : current;
  const financials = await gateway.getOrderFinancials(orderId);
  const receivedCents = toCents(financials.received);
  const plan = planPaymentSync({
    payments: data.payments,
    totalCents: chargedTotal(data),
    shopify: {
      receivedCents,
      outstandingCents: toCents(financials.outstanding),
    },
  });
  if (plan.kind === "record_full") {
    await gateway.recordFullPayment(orderId, plan.gateway);
    await rememberOwnTransactions(repo, gateway, data.id, orderId);
  } else if (plan.kind === "refund") {
    await gateway.refundPayment(orderId, {
      gateway: plan.gateway,
      amount: toDecimalString(plan.amountCents),
      // Mismo estado (cobrado en Shopify → pagado en el sistema), misma clave.
      idempotencyKey: `${data.id}:${receivedCents}:${receivedCents - plan.amountCents}`,
      note: "Reembolso registrado en el sistema",
    });
    await rememberOwnTransactions(repo, gateway, data.id, orderId);
  }
  const pending = data.payments.filter((p) => !p.synced).map((p) => p.id);
  if (plan.markSynced && pending.length > 0) {
    await repo.markPaymentsSynced(pending);
  }
  return plan.kind;
}

/** Piezas para conciliar la orden (Pasos 9.2 y 9.3): precio cobrado. */
function domainPieces(data: OrderRestoration): DomainOrderPiece[] {
  return [...data.pieces]
    .sort((a, b) => a.number - b.number)
    .map((p) => ({
      id: p.id,
      code: p.code,
      priceCents: p.priceCents,
      status: p.status,
      approved: p.approvedAt !== null,
    }));
}

function orderLines(order: Pick<ShopifyOrder, "lines">): OrderLine[] {
  return order.lines.map((l) => ({
    id: l.id,
    title: l.title,
    priceCents: toCents(l.price),
    fulfilled: l.fulfilled,
  }));
}

/** Marca como preparadas las líneas de piezas ya entregadas que aún no lo están (P44). */
async function fulfillDelivered(
  gateway: ShopifyGateway,
  data: OrderRestoration,
  order: ShopifyOrder,
) {
  const ids = linesToFulfill(domainPieces(data), orderLines(order));
  return ids.length ? gateway.fulfillLines(order.id, ids) : order;
}

/** La orden de piezas de una guía antigua (por su etiqueta: el código). */
async function currentOrder(gateway: ShopifyGateway, data: OrderRestoration) {
  const order = await gateway.findOrderByTag(data.code);
  // Shopify tarda unos segundos en indexar una orden.
  if (!order) {
    throw new ShopifyUnavailableError(
      `Shopify aún no muestra la orden de ${data.code}`,
    );
  }
  return order;
}

const gone = () =>
  new ShopifyUserError([
    { field: null, message: "La restauración ya no existe" },
  ]);

/**
 * Handlers del outbox de la restauración en Shopify. Con la orden de piezas (guías
 * antiguas), `order.edit` (9.2, P12), `order.fulfill` (9.3, P44) y `payment.sync`
 * (11.2) la concilian con el estado actual. Sin ella, `payment.sync` crea el pedido
 * de cada pago y `order.fulfill` los prepara al entregarse la guía. Todos leen el
 * estado al procesarse: repetirlos no cambia nada.
 */
export function restorationOrderHandlers(
  repo: RestorationOrderRepository,
  /** URL del sistema, para el enlace de la nota (se lee al procesar). */
  appUrl: () => string,
): Record<string, ShopifyJobHandler> {
  return {
    // Ya no se crea la orden con las piezas: un job encolado antes queda omitido.
    "order.create": async (job) => {
      const data = await repo.getOrderData(job.entityId);
      if (!data) throw gone();
      if (data.shopifyOrderId) {
        return {
          shopifyOrderId: data.shopifyOrderId,
          shopifyOrderName: data.shopifyOrderName,
        };
      }
      return { skipped: true } satisfies Json;
    },

    "order.edit": async (job, gateway) => {
      const data = await repo.getOrderData(job.entityId);
      if (!data) throw gone();
      if (!data.shopifyOrderId) return { skipped: true } satisfies Json;
      let order = await currentOrder(gateway, data);
      const pieces = domainPieces(data);
      const change = orderLinesChange(data.code, pieces, orderLines(order));
      if (!change) {
        const payments = await syncPayments(repo, gateway, data, order.id);
        return { shopifyOrderId: order.id, unchanged: true, payments };
      }
      order = await gateway.editOrder(order.id, {
        addLines: change.addLines.map((l) => ({
          title: l.title,
          price: toDecimalString(l.priceCents),
          quantity: 1,
        })),
        removeLineIds: change.removeLineIds,
        setPrices: change.setPrices.map((p) => ({
          lineId: p.lineId,
          price: toDecimalString(p.priceCents),
        })),
      });
      // Una pieza agregada que ya se entregó también queda preparada.
      order = await fulfillDelivered(gateway, data, order);
      await repo.saveLineIds(pieceLineIds(pieces, orderLines(order)));
      // Con otro total, lo pagado puede completar la orden (o sobrar).
      const payments = await syncPayments(repo, gateway, data, order.id);
      return {
        shopifyOrderId: order.id,
        added: change.addLines.length,
        removed: change.removeLineIds.length,
        repriced: change.setPrices.length,
        payments,
      };
    },

    "payment.sync": async (job, gateway) => {
      const data = await repo.getOrderData(job.entityId);
      if (!data) throw gone();
      if (!data.shopifyOrderId) {
        return await syncPaymentOrders(repo, gateway, data, appUrl());
      }
      const payments = await syncPayments(
        repo,
        gateway,
        data,
        data.shopifyOrderId,
      );
      return { shopifyOrderId: data.shopifyOrderId, payments };
    },

    "order.fulfill": async (job, gateway) => {
      const data = await repo.getOrderData(job.entityId);
      if (!data) throw gone();
      if (!data.shopifyOrderId) {
        return {
          delivered: isFullyDelivered(data),
          fulfilled: await fulfillPaymentOrders(gateway, data),
        };
      }
      const order = await currentOrder(gateway, data);
      const ids = linesToFulfill(domainPieces(data), orderLines(order));
      if (!ids.length) return { shopifyOrderId: order.id, fulfilled: 0 };
      await gateway.fulfillLines(order.id, ids);
      return { shopifyOrderId: order.id, fulfilled: ids.length };
    },
  };
}
