import { isClosedStatus, type PieceStatus } from "./piece-state-machine";

/**
 * Orden de Shopify de una restauración (Fase 9; P11, P12, P44, D30): una línea
 * personalizada por pieza que se cobra, con el título `Restauración RES-00001-1`.
 * Las líneas se reconocen por su título (Order Editing cambia el id de la línea al
 * cambiar su precio), así que la orden se "concilia" con el estado de las piezas en
 * vez de aplicar cambios sueltos: los jobs son idempotentes y se pueden repetir.
 */

export type OrderPiece = {
  id: string;
  /** RES-00001-1 */
  code: string;
  /** Precio en céntimos. */
  priceCents: number;
  status: PieceStatus;
  /** Las piezas que se agregan después de crear la orden entran al aprobarse (P12). */
  approved: boolean;
};

export type OrderLine = {
  id: string;
  title: string;
  /** Precio unitario en céntimos. */
  priceCents: number;
  fulfilled: boolean;
};

export const ORDER_TAG = "restauracion";

export function orderLineTitle(pieceCode: string): string {
  return `Restauración ${pieceCode}`;
}

/** Piezas que deben estar en la orden: aprobadas y que se cobran. */
export function chargedPieces(pieces: readonly OrderPiece[]): OrderPiece[] {
  return pieces.filter((p) => p.approved && !isClosedStatus(p.status));
}

/** Líneas de la orden que pertenecen a piezas de esta restauración. */
function ownLines(lines: readonly OrderLine[], restorationCode: string) {
  const prefix = orderLineTitle(`${restorationCode}-`);
  return lines.filter((l) => l.title.startsWith(prefix));
}

export type OrderLinesChange = {
  addLines: { title: string; priceCents: number }[];
  removeLineIds: string[];
  setPrices: { lineId: string; priceCents: number }[];
};

/**
 * Cambios para que la orden refleje las piezas (P12): quita las líneas de piezas
 * anuladas, rechazadas o sin arreglo, ajusta los precios cambiados y agrega las
 * piezas aprobadas después de crear la orden. Las líneas que no son de esta
 * restauración (agregadas a mano en Shopify) no se tocan. Null si no hay cambios.
 */
export function orderLinesChange(
  restorationCode: string,
  pieces: readonly OrderPiece[],
  lines: readonly OrderLine[],
): OrderLinesChange | null {
  const wanted = new Map(
    chargedPieces(pieces).map((p) => [orderLineTitle(p.code), p.priceCents]),
  );
  const change: OrderLinesChange = {
    addLines: [],
    removeLineIds: [],
    setPrices: [],
  };
  const present = new Set<string>();
  for (const line of ownLines(lines, restorationCode)) {
    const price = wanted.get(line.title);
    if (price === undefined || present.has(line.title)) {
      change.removeLineIds.push(line.id);
      continue;
    }
    present.add(line.title);
    if (price !== line.priceCents)
      change.setPrices.push({ lineId: line.id, priceCents: price });
  }
  for (const [title, priceCents] of wanted) {
    if (!present.has(title)) change.addLines.push({ title, priceCents });
  }
  const empty =
    !change.addLines.length &&
    !change.removeLineIds.length &&
    !change.setPrices.length;
  return empty ? null : change;
}

/** Líneas de las piezas entregadas que aún no están preparadas en Shopify (P44). */
export function linesToFulfill(
  pieces: readonly OrderPiece[],
  lines: readonly OrderLine[],
): string[] {
  const delivered = new Set(
    pieces
      .filter((p) => p.status === "entregada")
      .map((p) => orderLineTitle(p.code)),
  );
  return lines
    .filter((l) => delivered.has(l.title) && !l.fulfilled)
    .map((l) => l.id);
}

/** Id de la línea de cada pieza, para guardarlo en `pieces.shopify_line_item_id`. */
export function pieceLineIds(
  pieces: readonly OrderPiece[],
  lines: readonly OrderLine[],
): { pieceId: string; lineId: string | null }[] {
  const byTitle = new Map(lines.map((l) => [l.title, l.id]));
  return pieces.map((p) => ({
    pieceId: p.id,
    lineId: byTitle.get(orderLineTitle(p.code)) ?? null,
  }));
}
