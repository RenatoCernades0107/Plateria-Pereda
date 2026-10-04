import type { QuoteDisplayStatus } from "./quote";

/** Filtros del listado de cotizaciones, leídos de la URL (`/cotizaciones?estado=…`). */

export const QUOTES_PAGE_SIZE = 25;

export const QUOTE_STATUS_FILTERS = [
  "borrador",
  "emitida",
  "vencida",
  "aceptada",
  "rechazada",
] as const satisfies readonly QuoteDisplayStatus[];

export type QuoteFilters = {
  /** Código o nombre del cliente. */
  q: string;
  status: QuoteDisplayStatus | null;
  clientId: string | null;
  /** Fecha de creación en Lima, "AAAA-MM-DD" (inclusive). */
  from: string | null;
  to: string | null;
  page: number;
};

type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? "";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "AAAA-MM-DD" válida, o null. */
function isoDate(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
    ? value
    : null;
}

export function parseQuoteFilters(params: SearchParams): QuoteFilters {
  const page = Number.parseInt(first(params.pagina), 10);
  const status = first(params.estado);
  const client = first(params.cliente);
  return {
    q: first(params.q).trim().slice(0, 100),
    status: (QUOTE_STATUS_FILTERS as readonly string[]).includes(status)
      ? (status as QuoteDisplayStatus)
      : null,
    clientId: UUID.test(client) ? client.toLowerCase() : null,
    from: isoDate(first(params.desde)),
    to: isoDate(first(params.hasta)),
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

/** URL del listado con esos filtros (omite los vacíos). */
export function quoteFiltersHref(
  filters: QuoteFilters,
  changes: Partial<QuoteFilters> = {},
): string {
  const next = { ...filters, ...changes };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.status) params.set("estado", next.status);
  if (next.clientId) params.set("cliente", next.clientId);
  if (next.from) params.set("desde", next.from);
  if (next.to) params.set("hasta", next.to);
  if (next.page > 1) params.set("pagina", String(next.page));
  const query = params.toString();
  return query ? `/cotizaciones?${query}` : "/cotizaciones";
}

/** Texto seguro para un filtro `or` de PostgREST (sin comas, paréntesis ni comodines). */
export function searchTerm(q: string): string {
  return q
    .replace(/[,()*%\\:"']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
