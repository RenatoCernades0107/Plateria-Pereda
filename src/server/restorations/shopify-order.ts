import { priceWithIgv } from "@/domain/igv";
import { toDecimalString, type Cents } from "@/domain/money";
import { isClosedStatus, type PieceStatus } from "@/domain/piece-state-machine";
import { isReadyForShopifyOrder } from "@/domain/restoration-status";
import type { Json } from "@/lib/supabase/database.types";
import {
  ShopifyUnavailableError,
  ShopifyUserError,
} from "@/server/shopify/errors";
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

/**
 * Handler del outbox `order.create`. Es idempotente: si la restauración ya tiene su
 * orden no hace nada, y antes de crearla la busca por la etiqueta del código (un
 * reintento tras un corte no la duplica; `@idempotent` no lo evita, spike 4.1).
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
      const order =
        existing ??
        (await gateway.createOrder(buildOrderInput(data, appUrl())));
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
  };
}
