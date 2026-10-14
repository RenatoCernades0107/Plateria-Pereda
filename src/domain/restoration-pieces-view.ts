import { PIECE_STATUSES, type PieceStatus } from "./piece-state-machine";

/**
 * Vista de las piezas en el detalle de una restauración: lista (por defecto) o
 * kanban por estado (`/restauraciones/<id>?vista=kanban`).
 */
export type RestorationPiecesView = "lista" | "kanban";

type SearchParams = Record<string, string | string[] | undefined>;

export function parseRestorationPiecesView(
  params: SearchParams,
): RestorationPiecesView {
  const value = Array.isArray(params.vista) ? params.vista[0] : params.vista;
  return value === "kanban" ? "kanban" : "lista";
}

export function restorationPiecesHref(
  restorationId: string,
  view: RestorationPiecesView,
): string {
  const base = `/restauraciones/${restorationId}`;
  return view === "kanban" ? `${base}?vista=kanban` : base;
}

/** Enlace a la página de la pieza (`/piezas/<id>`, P55), con el acceso a su guía. */
export function pieceHref(piece: { id: string }): string {
  return `/piezas/${piece.id}`;
}

/** `id` HTML de la pieza en la lista de la restauración. */
export function pieceAnchor(pieceId: string): string {
  return `pieza-${pieceId}`;
}

/** Estados finales: su columna solo aparece si alguna pieza está en ella. */
export const RESTORATION_KANBAN_FINAL_STATUSES = [
  "entregada",
  "rechazada",
  "sin_arreglo",
  "anulada",
] as const satisfies readonly PieceStatus[];

/**
 * Columnas del kanban de una restauración: siempre los estados en curso y, de los
 * finales, solo los que tienen piezas (menos ruido en una restauración nueva).
 */
export function restorationKanbanStatuses(
  pieceStatuses: readonly PieceStatus[],
): PieceStatus[] {
  const final: readonly PieceStatus[] = RESTORATION_KANBAN_FINAL_STATUSES;
  return PIECE_STATUSES.filter(
    (status) => !final.includes(status) || pieceStatuses.includes(status),
  );
}
