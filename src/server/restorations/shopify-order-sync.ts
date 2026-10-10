import {
  linesToFulfill,
  ORDER_TAG,
  orderLinesChange,
  orderLineTitle,
  chargedPieces,
  pieceLineIds,
  type OrderLine,
  type OrderPiece,
} from "@/domain/shopify-order";
import {
  ShopifyUnavailableError,
  ShopifyUserError,
} from "@/server/shopify/errors";
import type { ShopifyGateway } from "@/server/shopify/gateway";
import { fromCents, toCents } from "@/server/shopify/money";
import type { OrderInput, ShopifyOrder } from "@/server/shopify/types";
import type { ShopifyJobHandler } from "@/server/shopify-sync/handlers";

/** Lo que los handlers necesitan de la restauración (se lee con la clave secreta). */
export type OrderContext = {
  id: string;
  code: string;
  shopifyOrderId: string | null;
  /** Cliente de Shopify de la orden: la persona, o el contacto si es una empresa. */
  customerId: string | null;
  /** Solo empresas (Companies de Shopify, P14). */
  companyLocationId: string | null;
  /** El cliente (o su contacto) existe pero aún no se sincronizó con Shopify. */
  customerPending: boolean;
  pieces: OrderPiece[];
};

export interface OrderSyncRepository {
  getOrderContext(restorationId: string): Promise<OrderContext | null>;
  saveOrder(
    restorationId: string,
    order: { id: string; name: string },
  ): Promise<void>;
  saveLineIds(
    lines: { pieceId: string; lineId: string | null }[],
  ): Promise<void>;
}

const gone = () =>
  new ShopifyUserError([
    { field: null, message: "La restauración ya no existe" },
  ]);

const notYet = (what: string) => new ShopifyUnavailableError(what);

function toLines(order: ShopifyOrder): OrderLine[] {
  return order.lines.map((l) => ({
    id: l.id,
    title: l.title,
    priceCents: toCents(l.price),
    fulfilled: l.fulfilled,
  }));
}

export function orderInput(ctx: OrderContext, appUrl: string): OrderInput {
  if (ctx.customerPending) throw notYet("El cliente aún no está en Shopify");
  if (!ctx.customerId)
    throw new ShopifyUserError([
      {
        field: null,
        message:
          "La empresa no tiene un contacto en Shopify a nombre de quien crear la orden",
      },
    ]);
  return {
    customerId: ctx.customerId,
    ...(ctx.companyLocationId && { companyLocationId: ctx.companyLocationId }),
    lines: chargedPieces(ctx.pieces).map((p) => ({
      title: orderLineTitle(p.code),
      price: fromCents(p.priceCents),
      quantity: 1,
    })),
    tags: [ORDER_TAG, ctx.code],
    note: `Restauración ${ctx.code}: ${appUrl.replace(/\/$/, "")}/restauraciones/${ctx.id}`,
  };
}

/** La orden ya creada de la restauración (por su etiqueta única, el código). */
async function currentOrder(gateway: ShopifyGateway, ctx: OrderContext) {
  if (!ctx.shopifyOrderId) throw notYet("La orden aún no se crea en Shopify");
  const order = await gateway.findOrderByTag(ctx.code);
  // Shopify tarda unos segundos en indexar una orden recién creada: se reintenta.
  if (!order) throw notYet(`Shopify aún no muestra la orden de ${ctx.code}`);
  return order;
}

async function fulfillDelivered(
  gateway: ShopifyGateway,
  ctx: OrderContext,
  order: ShopifyOrder,
) {
  const ids = linesToFulfill(ctx.pieces, toLines(order));
  return ids.length ? gateway.fulfillLines(order.id, ids) : order;
}

/**
 * Handlers del outbox para la orden de la restauración (Fase 9). Son idempotentes:
 * `order.create` busca primero la orden por su etiqueta (un corte a mitad de camino
 * no la duplica) y `order.edit` / `order.fulfill` concilian la orden con el estado
 * actual de las piezas, así que repetirlos no cambia nada.
 */
export function orderJobHandlers(
  repo: OrderSyncRepository,
  /** URL del sistema para el enlace de la nota (se lee al usarse, no al importar). */
  appUrl: () => string,
): Record<string, ShopifyJobHandler> {
  return {
    "order.create": async (job, gateway) => {
      const ctx = await repo.getOrderContext(job.entityId);
      if (!ctx) throw gone();
      if (ctx.shopifyOrderId)
        return { orderId: ctx.shopifyOrderId, existing: true };
      if (!chargedPieces(ctx.pieces).length)
        return { skipped: "sin piezas que cobrar" };
      let order = await gateway.findOrderByTag(ctx.code);
      const existing = Boolean(order);
      if (!order) order = await gateway.createOrder(orderInput(ctx, appUrl()));
      await repo.saveOrder(ctx.id, { id: order.id, name: order.name });
      // Si la orden se creó tarde, las piezas ya entregadas se marcan como preparadas.
      order = await fulfillDelivered(gateway, ctx, order);
      await repo.saveLineIds(pieceLineIds(ctx.pieces, toLines(order)));
      return { orderId: order.id, orderName: order.name, existing };
    },

    "order.edit": async (job, gateway) => {
      const ctx = await repo.getOrderContext(job.entityId);
      if (!ctx) throw gone();
      let order = await currentOrder(gateway, ctx);
      const change = orderLinesChange(ctx.code, ctx.pieces, toLines(order));
      if (!change) return { orderId: order.id, unchanged: true };
      order = await gateway.editOrder(order.id, {
        addLines: change.addLines.map((l) => ({
          title: l.title,
          price: fromCents(l.priceCents),
          quantity: 1,
        })),
        removeLineIds: change.removeLineIds,
        setPrices: change.setPrices.map((p) => ({
          lineId: p.lineId,
          price: fromCents(p.priceCents),
        })),
      });
      // Una pieza agregada que ya se entregó también queda preparada.
      order = await fulfillDelivered(gateway, ctx, order);
      await repo.saveLineIds(pieceLineIds(ctx.pieces, toLines(order)));
      return {
        orderId: order.id,
        added: change.addLines.length,
        removed: change.removeLineIds.length,
        repriced: change.setPrices.length,
      };
    },

    "order.fulfill": async (job, gateway) => {
      const ctx = await repo.getOrderContext(job.entityId);
      if (!ctx) throw gone();
      const order = await currentOrder(gateway, ctx);
      const ids = linesToFulfill(ctx.pieces, toLines(order));
      if (!ids.length) return { orderId: order.id, fulfilled: 0 };
      await gateway.fulfillLines(order.id, ids);
      return { orderId: order.id, fulfilled: ids.length };
    },
  };
}
