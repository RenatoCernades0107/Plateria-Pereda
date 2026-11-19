import {
  appendAll,
  manyOf,
  manyUuids,
  type SearchParams,
} from "./filter-params";
import type { PieceStatus } from "./piece-state-machine";

/**
 * Filtros del historial de piezas (`/piezas/historial?…`): piezas terminadas
 * (entregadas, anuladas, rechazadas o sin arreglo ya devueltas). La vista de piezas
 * muestra las entregadas solo el día de la entrega; después se consultan aquí.
 */

export const PIECES_HISTORY_PAGE_SIZE = 50;

export const HISTORY_STATUSES = [
  "entregada",
  "rechazada",
  "sin_arreglo",
  "anulada",
] as const satisfies readonly PieceStatus[];

export type PieceHistoryFilters = {
  /** Código de la pieza, descripción o cliente. */
  q: string;
  /** Número de guía (RES-00123, "123"…). */
  guide: string;
  /** Varios estados a la vez (`[]` = todos). */
  status: (typeof HISTORY_STATUSES)[number][];
  /** Varios talleres a la vez (`[]` = todos). */
  workshopIds: string[];
  /** Fecha de entrega o cierre, desde (AAAA-MM-DD, hora de Lima). */
  from: string | null;
  /** Fecha de entrega o cierre, hasta (AAAA-MM-DD, hora de Lima). */
  to: string | null;
  page: number;
};

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? "";

/** "AAAA-MM-DD" válida, o null. */
function isoDate(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
    ? value
    : null;
}

export function parsePieceHistoryFilters(
  params: SearchParams,
): PieceHistoryFilters {
  const page = Number.parseInt(first(params.pagina), 10);
  return {
    q: first(params.q).trim().slice(0, 100),
    guide: first(params.guia).trim().slice(0, 20),
    status: manyOf(HISTORY_STATUSES, params.estado),
    workshopIds: manyUuids(params.taller),
    from: isoDate(first(params.desde)),
    to: isoDate(first(params.hasta)),
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

export function pieceHistoryHref(
  filters: PieceHistoryFilters,
  changes: Partial<PieceHistoryFilters> = {},
): string {
  const next = { ...filters, ...changes };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.guide) params.set("guia", next.guide);
  appendAll(params, "estado", next.status);
  appendAll(params, "taller", next.workshopIds);
  if (next.from) params.set("desde", next.from);
  if (next.to) params.set("hasta", next.to);
  if (next.page > 1) params.set("pagina", String(next.page));
  const query = params.toString();
  return query ? `/piezas/historial?${query}` : "/piezas/historial";
}

export function listPiecesHistoryArgs(filters: PieceHistoryFilters) {
  return {
    p_query: filters.q || undefined,
    p_restoration_code: filters.guide || undefined,
    p_status: filters.status.length ? filters.status : undefined,
    p_workshop_ids: filters.workshopIds.length
      ? filters.workshopIds
      : undefined,
    p_from: filters.from ?? undefined,
    p_to: filters.to ?? undefined,
    p_limit: PIECES_HISTORY_PAGE_SIZE,
    p_offset: (filters.page - 1) * PIECES_HISTORY_PAGE_SIZE,
  };
}
