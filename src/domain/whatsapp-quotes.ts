import { calendarDaysBetween } from "./piece-days";

/**
 * Cotizaciones de restauración por WhatsApp (P46): lo cotizado queda fijo y se
 * copia a restauraciones con las piezas que el cliente confirma. Los estados los
 * calcula la BD (`derive_whatsapp_quote_status`); "descartada" la fija una persona.
 */

export const WHATSAPP_QUOTE_STATUSES = [
  "cotizada",
  "pedida_parcial",
  "pedida",
  "descartada",
] as const;
export type WhatsappQuoteStatus = (typeof WHATSAPP_QUOTE_STATUSES)[number];

export const WHATSAPP_QUOTE_STATUS_LABELS: Record<WhatsappQuoteStatus, string> =
  {
    cotizada: "Cotizada",
    pedida_parcial: "Pedida en parte",
    pedida: "Pedida completa",
    descartada: "Descartada",
  };

/** Igual a `derive_whatsapp_quote_status()` de la BD. */
export function deriveWhatsappQuoteStatus(
  items: number,
  ordered: number,
): Exclude<WhatsappQuoteStatus, "descartada"> {
  if (ordered <= 0) return "cotizada";
  return ordered >= items ? "pedida" : "pedida_parcial";
}

/** Se edita solo hasta la primera copia y si no está descartada (P46, Q8). */
export function canEditQuote(quote: {
  status: WhatsappQuoteStatus;
  everCopied: boolean;
}): boolean {
  return quote.status !== "descartada" && !quote.everCopied;
}

/** Se copia mientras le queden piezas pendientes y no esté descartada. */
export function canCopyQuote(quote: {
  status: WhatsappQuoteStatus;
  pendingCount: number;
}): boolean {
  return quote.status !== "descartada" && quote.pendingCount > 0;
}

/** Una cotización pedida completa ya no se descarta. */
export function canDiscardQuote(status: WhatsappQuoteStatus): boolean {
  return status === "cotizada" || status === "pedida_parcial";
}

/** Antigüedad en días calendario de Lima: "hoy", "hace 3 días", "hace 4 meses" (P46, Q6). */
export function quoteAge(createdAt: Date, now: Date): string {
  const days = calendarDaysBetween(createdAt, now);
  if (days === 0) return "hoy";
  if (days === 1) return "ayer";
  if (days < 30) return `hace ${days} días`;
  const months = Math.floor(days / 30);
  if (months < 12) return months === 1 ? "hace 1 mes" : `hace ${months} meses`;
  const years = Math.floor(days / 365);
  return years <= 1 ? "hace 1 año" : `hace ${years} años`;
}

/** Filtros del listado `/cotizaciones-whatsapp?…`. */
export const WHATSAPP_QUOTES_PAGE_SIZE = 25;

export type WhatsappQuoteFilters = {
  /** Código, cliente, nombre o teléfono anotados, o descripción de una pieza. */
  q: string;
  status: WhatsappQuoteStatus | null;
  clientId: string | null;
  /** Fecha de registro en Lima, "AAAA-MM-DD" (inclusive). */
  from: string | null;
  to: string | null;
  page: number;
};

type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? "";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isoDate(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
    ? value
    : null;
}

export function parseWhatsappQuoteFilters(
  params: SearchParams,
): WhatsappQuoteFilters {
  const page = Number.parseInt(first(params.pagina), 10);
  const status = first(params.estado);
  const client = first(params.cliente);
  return {
    q: first(params.q).trim().slice(0, 100),
    status: (WHATSAPP_QUOTE_STATUSES as readonly string[]).includes(status)
      ? (status as WhatsappQuoteStatus)
      : null,
    clientId: UUID.test(client) ? client.toLowerCase() : null,
    from: isoDate(first(params.desde)),
    to: isoDate(first(params.hasta)),
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

export function whatsappQuoteFiltersHref(
  filters: WhatsappQuoteFilters,
  changes: Partial<WhatsappQuoteFilters> = {},
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
  return query ? `/cotizaciones-whatsapp?${query}` : "/cotizaciones-whatsapp";
}

/** Argumentos de `list_whatsapp_quotes`. */
export function listWhatsappQuotesArgs(
  filters: WhatsappQuoteFilters,
  limit = WHATSAPP_QUOTES_PAGE_SIZE,
) {
  return {
    p_query: filters.q || undefined,
    p_status: filters.status ?? undefined,
    p_client_id: filters.clientId ?? undefined,
    p_from: filters.from ?? undefined,
    p_to: filters.to ?? undefined,
    p_limit: limit,
    p_offset: (filters.page - 1) * limit,
  };
}
