import {
  appendAll,
  list,
  manyOf,
  manyUuids,
  type SearchParams,
} from "./filter-params";
import type { PieceStatus } from "./piece-state-machine";
import type { PieceLocation } from "./restoration-status";

/** Filtros de la vista de piezas (`/piezas?ubicacion=…`), inicio de logística. */

export const PIECES_PAGE_SIZE = 50;
/** El kanban muestra todo en una página (con el tope de la consulta). */
export const PIECES_KANBAN_LIMIT = 200;

/**
 * Desde cuántos días en el taller se resalta una pieza. Propuesta: una semana; se
 * puede volver configurable si lo piden.
 */
export const WORKSHOP_DAYS_ALERT = 7;

/**
 * La vista muestra piezas en curso (P42): sin anuladas; las rechazadas o sin arreglo
 * mientras siguen en la tienda (por devolver, P47). Las entregadas (o devueltas al
 * cliente) siguen a la vista solo el día de la entrega, en hora de Lima; desde el día
 * siguiente están en el historial (`/piezas/historial`).
 */
export const BOARD_LOCATIONS = [
  "por_whatsapp",
  "sin_enviar",
  "en_taller",
  "en_tienda",
  "entregada",
] as const satisfies readonly PieceLocation[];
export const BOARD_STATUSES = [
  "registrada",
  "en_consulta",
  "en_espera",
  "aprobada",
  "observada",
  "entregada",
  "rechazada",
  "sin_arreglo",
] as const satisfies readonly PieceStatus[];

/** Orden de la vista: por guía (por defecto), fecha de registro, precio o días en taller. */
export const PIECE_BOARD_SORTS = [
  "guia",
  "fecha",
  "precio",
  "dias_taller",
] as const;
export type PieceBoardSort = (typeof PIECE_BOARD_SORTS)[number];
export type PieceBoardSortDir = "asc" | "desc";

export const PIECE_BOARD_SORT_LABELS: Record<PieceBoardSort, string> = {
  guia: "Guía",
  fecha: "Fecha de registro",
  precio: "Precio de venta",
  dias_taller: "Días en taller",
};

export type PieceBoardFilters = {
  /** Código de la pieza, descripción o cliente. */
  q: string;
  /** Número de guía (RES-00123, "123"…): solo las piezas de esa restauración. */
  guide: string;
  /** Varias ubicaciones a la vez (`[]` = todas). */
  location: (typeof BOARD_LOCATIONS)[number][];
  /** Varios estados a la vez (`[]` = todos). */
  status: (typeof BOARD_STATUSES)[number][];
  /** Varios talleres a la vez (`[]` = todos). */
  workshopIds: string[];
  /** Además de los talleres elegidos, las piezas sin taller (`taller=sin`). */
  noWorkshop: boolean;
  /** Solo piezas con al menos estos días en el taller. */
  minDays: number | null;
  /** Solo urgentes (P47). */
  urgent: boolean;
  /**
   * "Listas para entregar": las que volvieron del taller y las rechazadas o sin
   * arreglo que siguen en la tienda (por devolver).
   */
  ready: boolean;
  /** Por guía: la más reciente primero y sus piezas en orden. */
  sort: PieceBoardSort;
  dir: PieceBoardSortDir;
  page: number;
  /** Tabla paginada o tablero kanban por estado. */
  view: "tabla" | "kanban";
};

/** Valor de `taller` en la URL para "Sin taller". */
export const NO_WORKSHOP = "sin";

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? "";

const oneOf = <T extends string>(options: readonly T[], value: string) =>
  (options as readonly string[]).includes(value) ? (value as T) : null;

export function parsePieceBoardFilters(
  params: SearchParams,
): PieceBoardFilters {
  const page = Number.parseInt(first(params.pagina), 10);
  const days = Number.parseInt(first(params.dias), 10);
  const workshops = list(params.taller);
  return {
    q: first(params.q).trim().slice(0, 100),
    guide: first(params.guia).trim().slice(0, 20),
    location: manyOf(BOARD_LOCATIONS, params.ubicacion),
    status: manyOf(BOARD_STATUSES, params.estado),
    workshopIds: manyUuids(workshops),
    noWorkshop: workshops.includes(NO_WORKSHOP),
    minDays: Number.isFinite(days) && days > 0 ? Math.min(days, 365) : null,
    urgent: first(params.urgentes) === "1",
    ready: first(params.listas) === "1",
    sort: oneOf(PIECE_BOARD_SORTS, first(params.orden)) ?? "guia",
    dir: first(params.dir) === "asc" ? "asc" : "desc",
    page: Number.isFinite(page) && page > 0 ? page : 1,
    view: first(params.vista) === "kanban" ? "kanban" : "tabla",
  };
}

export function pieceBoardHref(
  filters: PieceBoardFilters,
  changes: Partial<PieceBoardFilters> = {},
): string {
  const next = { ...filters, ...changes };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.guide) params.set("guia", next.guide);
  appendAll(params, "ubicacion", next.location);
  appendAll(params, "estado", next.status);
  appendAll(params, "taller", next.workshopIds);
  if (next.noWorkshop) params.append("taller", NO_WORKSHOP);
  if (next.minDays) params.set("dias", String(next.minDays));
  if (next.urgent) params.set("urgentes", "1");
  if (next.ready) params.set("listas", "1");
  if (next.sort !== "guia") params.set("orden", next.sort);
  if (next.dir !== "desc") params.set("dir", next.dir);
  if (next.page > 1 && next.view === "tabla")
    params.set("pagina", String(next.page));
  if (next.view === "kanban") params.set("vista", "kanban");
  const query = params.toString();
  return query ? `/piezas?${query}` : "/piezas";
}

export function listPiecesBoardArgs(filters: PieceBoardFilters) {
  return {
    p_query: filters.q || undefined,
    p_restoration_code: filters.guide || undefined,
    p_location: filters.location.length ? filters.location : undefined,
    p_status: filters.status.length ? filters.status : undefined,
    p_workshop_ids: filters.workshopIds.length
      ? filters.workshopIds
      : undefined,
    p_no_workshop: filters.noWorkshop || undefined,
    p_min_workshop_days: filters.minDays ?? undefined,
    p_urgent: filters.urgent || undefined,
    p_ready: filters.ready || undefined,
    p_sort: filters.sort,
    p_dir: filters.dir,
    p_limit: filters.view === "kanban" ? PIECES_KANBAN_LIMIT : PIECES_PAGE_SIZE,
    p_offset:
      filters.view === "kanban" ? 0 : (filters.page - 1) * PIECES_PAGE_SIZE,
  };
}

/**
 * Al ordenar por otra columna se vuelve a la primera página y se empieza de mayor a
 * menor (la guía más reciente, el precio más alto…); la misma columna invierte.
 */
export function pieceSortChange(
  filters: PieceBoardFilters,
  sort: PieceBoardSort,
): Partial<PieceBoardFilters> {
  const dir: PieceBoardSortDir =
    filters.sort === sort && filters.dir === "desc" ? "asc" : "desc";
  return { sort, dir, page: 1 };
}

/** Se resalta la pieza que sigue en el taller desde hace muchos días. */
export function isLongInWorkshop(
  piece: { workshopDays: number; workshopOngoing: boolean },
  alertDays = WORKSHOP_DAYS_ALERT,
): boolean {
  return piece.workshopOngoing && piece.workshopDays >= alertDays;
}
