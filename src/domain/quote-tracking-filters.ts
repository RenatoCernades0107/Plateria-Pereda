import {
  appendAll,
  list,
  manyOf,
  manyUuids,
  type SearchParams,
} from "./filter-params";
import { QUOTE_WORK_LOCATIONS, type QuoteWorkLocation } from "./quote-tracking";

/**
 * Filtros del listado de seguimiento de cotizaciones aprobadas (la vista de logística),
 * leídos de la URL (`/cotizaciones?estado=…&taller=…&ubicacion=…`).
 */

export const TRACKING_PAGE_SIZE = 25;

export const TRACKING_STATUS_FILTERS = ["aceptada", "facturada"] as const;
export type TrackingStatus = (typeof TRACKING_STATUS_FILTERS)[number];

/** Valor del filtro de taller para las cotizaciones que aún no tienen uno. */
export const NO_WORKSHOP = "sin";

export type TrackingFilters = {
  q: string;
  /** Varios estados a la vez (`[]` = todos). */
  status: TrackingStatus[];
  /** Varios talleres a la vez (`[]` = todos). */
  workshopIds: string[];
  /** Además de los talleres elegidos, las que aún no tienen taller (`taller=sin`). */
  noWorkshop: boolean;
  /** Varias ubicaciones a la vez (`[]` = todas). */
  location: QuoteWorkLocation[];
  page: number;
};

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? "";

export function parseTrackingFilters(params: SearchParams): TrackingFilters {
  const page = Number.parseInt(first(params.pagina), 10);
  return {
    q: first(params.q).trim().slice(0, 100),
    status: manyOf(TRACKING_STATUS_FILTERS, params.estado),
    workshopIds: manyUuids(params.taller),
    noWorkshop: list(params.taller).includes(NO_WORKSHOP),
    location: manyOf(QUOTE_WORK_LOCATIONS, params.ubicacion),
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

/** URL del listado con esos filtros (omite los vacíos). */
export function trackingFiltersHref(
  filters: TrackingFilters,
  changes: Partial<TrackingFilters> = {},
): string {
  const next = { ...filters, ...changes };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  appendAll(params, "estado", next.status);
  appendAll(params, "taller", next.workshopIds);
  if (next.noWorkshop) params.append("taller", NO_WORKSHOP);
  appendAll(params, "ubicacion", next.location);
  if (next.page > 1) params.set("pagina", String(next.page));
  const query = params.toString();
  return query ? `/cotizaciones?${query}` : "/cotizaciones";
}
