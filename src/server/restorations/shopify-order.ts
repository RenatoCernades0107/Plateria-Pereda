import { toDecimalString, type Cents } from "@/domain/money";
import {
  orderCreatePayments,
  planPaymentSync,
  type SyncPayment,
} from "@/domain/payment-sync";
import { isClosedStatus, type PieceStatus } from "@/domain/piece-state-machine";
import {
  externalPayments,
  type ImportedPayment,
} from "@/domain/shopify-transactions";
import { isReadyForShopifyOrder } from "@/domain/restoration-status";
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
import type { OrderInput, ShopifyOrder } from "@/server/shopify/types";
import type { ShopifyJobHandler } from "@/server/shopify-sync/handlers";

/**
 * Orden de venta en Shopify al aprobar la restauración (Paso 9.1). Una línea
 * personalizada por pieza que se cobra, con el título "Restauración RES-00001-1"
 * (D30) y su precio; etiquetas `restauracion` y el código; nota con el
 * enlace al sistema. Los pagos registrados antes de la orden (el adelanto al aprobar)
 * van incluidos al crearla; los posteriores los concilia `payment.sync` (11.2).
 */

export type OrderPiece = {
  id: string;
  code: string;
  number: number;
  /** null: precio de venta sin asignar (D58); la orden espera a que lo tenga. */
  priceCents: Cents | null;
  status: PieceStatus;
  approvedAt: string | null;
};

export type OrderRestoration = {
  id: string;
  code: string;
  shopifyOrderId: string | null;
  shopifyOrderName: string | null;
  pieces: OrderPiece[];
  client: {
    kind: "persona" | "empresa";
    shopifyCustomerId: string | null;
    shopifyCompanyLocationId: string | null;
  };
  /**
   * Contacto de la restauración o, en una empresa sin contacto elegido, su primer
   * contacto activo (la orden necesita un comprador). null si la empresa no tiene.
   */
  contact: { shopifyCustomerId: string | null } | null;
  /** Pagos y reembolsos del sistema, en orden (11.2). */
  payments: SyncPayment[];
};

/** Lectura y escritura de la restauración para el handler (con la clave secreta). */
export interface RestorationOrderRepository {
  getOrderData(restorationId: string): Promise<OrderRestoration | null>;
  /** Guarda la orden y el id de la línea de cada pieza (para editarla o prepararla). */
  saveOrder(
    restorationId: string,
    order: { id: string; name: string },
    lineIds: Record<string, string>,
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
    payments: ImportedPayment[],
  ): Promise<void>;
}

/** Etiqueta única de la orden: el código de la restauración (para no duplicarla). */
export const orderTag = (code: string) => code;

export const lineTitle = (pieceCode: string) => `Restauración ${pieceCode}`;

type BillablePiece = OrderPiece & { priceCents: Cents };

/**
 * Piezas que van a la orden: las que se cobran, en orden. La orden se crea cuando
 * todas tienen precio (D58), así que una sin precio no llega aquí; si llegara, se
 * omite en vez de cobrarla en 0.
 */
export function billablePieces(pieces: readonly OrderPiece[]): BillablePiece[] {
  return pieces
    .filter(
      (p): p is BillablePiece =>
        !isClosedStatus(p.status) && p.priceCents !== null,
    )
    .sort((a, b) => a.number - b.number);
}

/** Comprador de la orden: la persona, o la empresa (su ubicación) con su contacto (P14). */
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
          "La empresa no tiene contactos: agrega uno para crear la orden en Shopify",
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

/** Total que se cobra: las piezas que van a la orden. */
export function chargedTotal(data: OrderRestoration): Cents {
  return billablePieces(data.pieces).reduce((sum, p) => sum + p.priceCents, 0);
}

/** Datos de la orden a partir de la restauración, con los pagos ya registrados. */
export function buildOrderInput(
  data: OrderRestoration,
  appUrl: string,
): OrderInput {
  const payments = orderCreatePayments(data.payments, chargedTotal(data));
  return {
    ...orderBuyer(data),
    lines: billablePieces(data.pieces).map((piece) => ({
      title: lineTitle(piece.code),
      price: toDecimalString(piece.priceCents),
      quantity: 1,
    })),
    tags: ["restauracion", orderTag(data.code)],
    note: `Restauración ${data.code}: ${new URL(`/restauraciones/${data.id}`, appUrl)}`,
    ...(payments.length > 0 && {
      payments: payments.map((p) => ({
        gateway: p.gateway,
        amount: toDecimalString(p.amountCents),
      })),
    }),
  };
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
 * Concilia los pagos del sistema con la orden (11.2): pago completo, reembolso de la
 * diferencia o nada (pagos intermedios). Repetirlo no cambia nada.
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

/** Id de la línea de cada pieza, por su título. */
export function lineIdsByPiece(
  pieces: readonly OrderPiece[],
  order: Pick<ShopifyOrder, "lines">,
): Record<string, string> {
  const byTitle = new Map(order.lines.map((l) => [l.title, l.id]));
  return Object.fromEntries(
    pieces.flatMap((p) => {
      const lineId = byTitle.get(lineTitle(p.code));
      return lineId ? [[p.id, lineId]] : [];
    }),
  );
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

/** La orden ya creada (por su etiqueta); si aún no está, el job se reintenta. */
async function currentOrder(gateway: ShopifyGateway, data: OrderRestoration) {
  if (!data.shopifyOrderId) {
    throw new ShopifyUnavailableError("La orden aún no se crea en Shopify");
  }
  const order = await gateway.findOrderByTag(orderTag(data.code));
  // Shopify tarda unos segundos en indexar una orden recién creada.
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
 * Handlers del outbox de la orden. `order.create` (9.1) es idempotente: si la
 * restauración ya tiene su orden no hace nada, y antes de crearla la busca por la
 * etiqueta del código (un reintento tras un corte no la duplica; `@idempotent` no
 * lo evita, spike 4.1). `order.edit` (9.2, P12) y `order.fulfill` (9.3, P44)
 * concilian la orden con el estado actual de las piezas: repetirlos no cambia nada.
 */
export function restorationOrderHandlers(
  repo: RestorationOrderRepository,
  /** URL del sistema, para el enlace de la nota (se lee al procesar). */
  appUrl: () => string,
): Record<string, ShopifyJobHandler> {
  return {
    "order.create": async (job, gateway) => {
      const data = await repo.getOrderData(job.entityId);
      if (!data) {
        throw new ShopifyUserError([
          { field: null, message: "La restauración ya no existe" },
        ]);
      }
      if (data.shopifyOrderId) {
        return {
          shopifyOrderId: data.shopifyOrderId,
          shopifyOrderName: data.shopifyOrderName,
        };
      }
      // Cambió desde que se encoló (p. ej., se agregó una pieza): la BD vuelve a
      // encolar la orden cuando todas las piezas que se cobran estén aprobadas y con
      // precio (D58).
      const ready = isReadyForShopifyOrder(
        data.pieces.map((p) => ({
          status: p.status,
          approvedAt: p.approvedAt ? new Date(p.approvedAt) : null,
          priceCents: p.priceCents,
        })),
      );
      if (!ready) {
        return { skipped: true } satisfies Json;
      }

      const existing = await gateway.findOrderByTag(orderTag(data.code));
      let order =
        existing ??
        (await gateway.createOrder(buildOrderInput(data, appUrl())));
      // Si la orden se crea tarde, las piezas ya entregadas quedan preparadas.
      order = await fulfillDelivered(gateway, data, order);
      await repo.saveOrder(
        data.id,
        { id: order.id, name: order.name },
        lineIdsByPiece(data.pieces, order),
      );
      // Las transacciones de la orden recién creada (o hallada por su etiqueta tras
      // un corte) son los pagos que incluyó el sistema.
      await rememberOwnTransactions(repo, gateway, data.id, order.id);
      // Los pagos incluidos ya están allá; lo que quede (p. ej., un pago registrado
      // mientras se creaba) se concilia ahora.
      if (!existing) {
        const included = data.payments.filter((p) => !p.synced);
        if (included.length > 0) {
          await repo.markPaymentsSynced(included.map((p) => p.id));
          for (const p of included) p.synced = true;
        }
      }
      const payments = await syncPayments(
        repo,
        gateway,
        (await repo.getOrderData(data.id)) ?? data,
        order.id,
      );
      return {
        shopifyOrderId: order.id,
        shopifyOrderName: order.name,
        linked: Boolean(existing),
        payments,
      };
    },

    "order.edit": async (job, gateway) => {
      const data = await repo.getOrderData(job.entityId);
      if (!data) throw gone();
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
      // Sin orden no hay nada que conciliar: los pagos irán al crearla.
      if (!data.shopifyOrderId) return { skipped: true } satisfies Json;
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
      const order = await currentOrder(gateway, data);
      const ids = linesToFulfill(domainPieces(data), orderLines(order));
      if (!ids.length) return { shopifyOrderId: order.id, fulfilled: 0 };
      await gateway.fulfillLines(order.id, ids);
      return { shopifyOrderId: order.id, fulfilled: ids.length };
    },
  };
}
