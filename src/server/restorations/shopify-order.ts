import { priceWithIgv } from "@/domain/igv";
import { toDecimalString, type Cents } from "@/domain/money";
import { isClosedStatus, type PieceStatus } from "@/domain/piece-state-machine";
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
 * (D30) y su precio con IGV (P13); etiquetas `restauracion` y el código; nota con el
 * enlace al sistema. Los pagos registrados al aprobar se agregan en la Fase 11.
 */

export type OrderPiece = {
  id: string;
  code: string;
  number: number;
  priceCents: Cents;
  status: PieceStatus;
  approvedAt: string | null;
};

export type OrderRestoration = {
  id: string;
  code: string;
  pricesIncludeIgv: boolean;
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
}

/** Etiqueta única de la orden: el código de la restauración (para no duplicarla). */
export const orderTag = (code: string) => code;

export const lineTitle = (pieceCode: string) => `Restauración ${pieceCode}`;

/** Piezas que van a la orden: las que se cobran, en orden. */
export function billablePieces(pieces: readonly OrderPiece[]): OrderPiece[] {
  return pieces
    .filter((p) => !isClosedStatus(p.status))
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

/** Datos de la orden a partir de la restauración. */
export function buildOrderInput(
  data: OrderRestoration,
  appUrl: string,
): OrderInput {
  return {
    ...orderBuyer(data),
    lines: billablePieces(data.pieces).map((piece) => ({
      title: lineTitle(piece.code),
      price: toDecimalString(
        priceWithIgv(piece.priceCents, data.pricesIncludeIgv),
      ),
      quantity: 1,
    })),
    tags: ["restauracion", orderTag(data.code)],
    note: `Restauración ${data.code}: ${new URL(`/restauraciones/${data.id}`, appUrl)}`,
  };
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

/** Piezas para conciliar la orden (Pasos 9.2 y 9.3): precio cobrado, con IGV. */
function domainPieces(data: OrderRestoration): DomainOrderPiece[] {
  return [...data.pieces]
    .sort((a, b) => a.number - b.number)
    .map((p) => ({
      id: p.id,
      code: p.code,
      priceCents: priceWithIgv(p.priceCents, data.pricesIncludeIgv),
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
      // encolar la orden cuando todas las piezas que se cobran estén aprobadas.
      const ready = isReadyForShopifyOrder(
        data.pieces.map((p) => ({
          status: p.status,
          approvedAt: p.approvedAt ? new Date(p.approvedAt) : null,
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
      return {
        shopifyOrderId: order.id,
        shopifyOrderName: order.name,
        linked: Boolean(existing),
      };
    },

    "order.edit": async (job, gateway) => {
      const data = await repo.getOrderData(job.entityId);
      if (!data) throw gone();
      let order = await currentOrder(gateway, data);
      const pieces = domainPieces(data);
      const change = orderLinesChange(data.code, pieces, orderLines(order));
      if (!change) return { shopifyOrderId: order.id, unchanged: true };
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
      return {
        shopifyOrderId: order.id,
        added: change.addLines.length,
        removed: change.removeLineIds.length,
        repriced: change.setPrices.length,
      };
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
