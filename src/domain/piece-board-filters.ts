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
 * La vista solo muestra piezas en curso (P42): sin entregadas ni anuladas; las
 * rechazadas o sin arreglo solo mientras siguen en la tienda (por devolver, P47).
 */
export const BOARD_LOCATIONS = [
  "sin_enviar",
  "en_tienda",
  "en_taller",
] as const satisfies readonly PieceLocation[];
export const BOARD_STATUSES = [
  "registrada",
  "en_consulta",
  "en_espera",
  "aprobada",
  "enviada_taller",
  "observada",
  "rechazada",
  "sin_arreglo",
] as const satisfies readonly PieceStatus[];

export type PieceBoardFilters = {
  /** Código de la pieza, descripción o cliente. */
  q: string;
  location: (typeof BOARD_LOCATIONS)[number] | null;
  status: (typeof BOARD_STATUSES)[number] | null;
  workshopId: string | null;
  /** Solo piezas con al menos estos días en el taller. */
  minDays: number | null;
  /** Solo urgentes (P47). */
  urgent: boolean;
  /** Solo las que volvieron del taller ("Lista para entregar"). */
  ready: boolean;
  /** Solo rechazadas o sin arreglo que siguen en la tienda. */
  toReturn: boolean;
  page: number;
  /** Tabla paginada o tablero kanban por estado. */
  view: "tabla" | "kanban";
};

type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? "";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const oneOf = <T extends string>(options: readonly T[], value: string) =>
  (options as readonly string[]).includes(value) ? (value as T) : null;

export function parsePieceBoardFilters(
  params: SearchParams,
): PieceBoardFilters {
  const page = Number.parseInt(first(params.pagina), 10);
  const days = Number.parseInt(first(params.dias), 10);
  const workshop = first(params.taller);
  return {
    q: first(params.q).trim().slice(0, 100),
    location: oneOf(BOARD_LOCATIONS, first(params.ubicacion)),
    status: oneOf(BOARD_STATUSES, first(params.estado)),
    workshopId: UUID.test(workshop) ? workshop.toLowerCase() : null,
    minDays: Number.isFinite(days) && days > 0 ? Math.min(days, 365) : null,
    urgent: first(params.urgentes) === "1",
    ready: first(params.listas) === "1",
    toReturn: first(params.devolver) === "1",
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
  if (next.location) params.set("ubicacion", next.location);
  if (next.status) params.set("estado", next.status);
  if (next.workshopId) params.set("taller", next.workshopId);
  if (next.minDays) params.set("dias", String(next.minDays));
  if (next.urgent) params.set("urgentes", "1");
  if (next.ready) params.set("listas", "1");
  if (next.toReturn) params.set("devolver", "1");
  if (next.page > 1 && next.view === "tabla")
    params.set("pagina", String(next.page));
  if (next.view === "kanban") params.set("vista", "kanban");
  const query = params.toString();
  return query ? `/piezas?${query}` : "/piezas";
}

export function listPiecesBoardArgs(filters: PieceBoardFilters) {
  return {
    p_query: filters.q || undefined,
    p_location: filters.location ?? undefined,
    p_status: filters.status ?? undefined,
    p_workshop_id: filters.workshopId ?? undefined,
    p_min_workshop_days: filters.minDays ?? undefined,
    p_urgent: filters.urgent || undefined,
    p_ready: filters.ready || undefined,
    p_to_return: filters.toReturn || undefined,
    p_limit: filters.view === "kanban" ? PIECES_KANBAN_LIMIT : PIECES_PAGE_SIZE,
    p_offset:
      filters.view === "kanban" ? 0 : (filters.page - 1) * PIECES_PAGE_SIZE,
  };
}

/** Se resalta la pieza que sigue en el taller desde hace muchos días. */
export function isLongInWorkshop(
  piece: { workshopDays: number; workshopOngoing: boolean },
  alertDays = WORKSHOP_DAYS_ALERT,
): boolean {
  return piece.workshopOngoing && piece.workshopDays >= alertDays;
}
