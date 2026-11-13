import { isQuoteWorkLocation, type QuoteWorkLocation } from "./quote-tracking";

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
  status: TrackingStatus | null;
  /** Id del taller, o `NO_WORKSHOP` para las que no tienen taller. */
  workshop: string | null;
  location: QuoteWorkLocation | null;
  page: number;
};

type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? "";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseTrackingFilters(params: SearchParams): TrackingFilters {
  const page = Number.parseInt(first(params.pagina), 10);
  const status = first(params.estado);
  const workshop = first(params.taller);
  const location = first(params.ubicacion);
  return {
    q: first(params.q).trim().slice(0, 100),
    status: (TRACKING_STATUS_FILTERS as readonly string[]).includes(status)
      ? (status as TrackingStatus)
      : null,
    workshop:
      workshop === NO_WORKSHOP
        ? NO_WORKSHOP
        : UUID.test(workshop)
          ? workshop.toLowerCase()
          : null,
    location: isQuoteWorkLocation(location) ? location : null,
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
  if (next.status) params.set("estado", next.status);
  if (next.workshop) params.set("taller", next.workshop);
  if (next.location) params.set("ubicacion", next.location);
  if (next.page > 1) params.set("pagina", String(next.page));
  const query = params.toString();
  return query ? `/cotizaciones?${query}` : "/cotizaciones";
}
