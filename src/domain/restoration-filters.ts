import {
  PAYMENT_STATUSES,
  PAYMENT_TYPES,
  type PaymentStatus,
  type PaymentType,
} from "./money";
import {
  RESTORATION_STATUSES,
  type RestorationStatus,
} from "./restoration-status";

/** Filtros del listado de restauraciones, leídos de la URL (`/restauraciones?estado=…`). */

export const RESTORATIONS_PAGE_SIZE = 25;
/** Tope de filas del CSV. */
export const RESTORATIONS_EXPORT_LIMIT = 5000;

export const RESTORATION_SORTS = [
  "created_at",
  "code",
  "client",
  "total",
] as const;
/** Tabla paginada o tablero kanban por estado. */
export const LIST_VIEWS = ["tabla", "kanban"] as const;
export type ListView = (typeof LIST_VIEWS)[number];
/** El kanban muestra todo en una página (con tope): sin paginación. */
export const RESTORATIONS_KANBAN_LIMIT = 300;

export type RestorationSort = (typeof RESTORATION_SORTS)[number];
export type SortDir = "asc" | "desc";

export type RestorationFilters = {
  /** Código, cliente, documento o contacto. */
  q: string;
  status: RestorationStatus | null;
  paymentStatus: PaymentStatus | null;
  paymentType: PaymentType | null;
  clientId: string | null;
  workshopId: string | null;
  /** Fecha de registro en Lima, "AAAA-MM-DD" (inclusive). */
  from: string | null;
  to: string | null;
  sort: RestorationSort;
  dir: SortDir;
  page: number;
  view: ListView;
};

type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? "";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const oneOf = <T extends string>(options: readonly T[], value: string) =>
  (options as readonly string[]).includes(value) ? (value as T) : null;

/** "AAAA-MM-DD" válida, o null. */
function isoDate(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
    ? value
    : null;
}

const uuid = (value: string) => (UUID.test(value) ? value.toLowerCase() : null);

export function parseRestorationFilters(
  params: SearchParams,
): RestorationFilters {
  const page = Number.parseInt(first(params.pagina), 10);
  return {
    q: first(params.q).trim().slice(0, 100),
    status: oneOf(RESTORATION_STATUSES, first(params.estado)),
    paymentStatus: oneOf(PAYMENT_STATUSES, first(params.pago)),
    paymentType: oneOf(PAYMENT_TYPES, first(params.tipo)),
    clientId: uuid(first(params.cliente)),
    workshopId: uuid(first(params.taller)),
    from: isoDate(first(params.desde)),
    to: isoDate(first(params.hasta)),
    sort: oneOf(RESTORATION_SORTS, first(params.orden)) ?? "created_at",
    dir: first(params.dir) === "asc" ? "asc" : "desc",
    page: Number.isFinite(page) && page > 0 ? page : 1,
    view: first(params.vista) === "kanban" ? "kanban" : "tabla",
  };
}

/** Parámetros de la URL con esos filtros (omite los vacíos y los valores por defecto). */
export function restorationFiltersQuery(
  filters: RestorationFilters,
  changes: Partial<RestorationFilters> = {},
): string {
  const next = { ...filters, ...changes };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.status) params.set("estado", next.status);
  if (next.paymentStatus) params.set("pago", next.paymentStatus);
  if (next.paymentType) params.set("tipo", next.paymentType);
  if (next.clientId) params.set("cliente", next.clientId);
  if (next.workshopId) params.set("taller", next.workshopId);
  if (next.from) params.set("desde", next.from);
  if (next.to) params.set("hasta", next.to);
  if (next.sort !== "created_at") params.set("orden", next.sort);
  if (next.dir !== "desc") params.set("dir", next.dir);
  if (next.page > 1 && next.view === "tabla")
    params.set("pagina", String(next.page));
  if (next.view === "kanban") params.set("vista", "kanban");
  return params.toString();
}

export function restorationFiltersHref(
  filters: RestorationFilters,
  changes: Partial<RestorationFilters> = {},
): string {
  const query = restorationFiltersQuery(filters, changes);
  return query ? `/restauraciones?${query}` : "/restauraciones";
}

/** Al ordenar por otra columna se vuelve a la primera página; la misma columna invierte. */
export function sortChange(
  filters: RestorationFilters,
  sort: RestorationSort,
): Partial<RestorationFilters> {
  const dir: SortDir =
    filters.sort === sort
      ? filters.dir === "asc"
        ? "desc"
        : "asc"
      : sort === "created_at" || sort === "total"
        ? "desc"
        : "asc";
  return { sort, dir, page: 1 };
}

/** Argumentos de `list_restorations()` para esos filtros. */
export function listRestorationsArgs(
  filters: RestorationFilters,
  {
    limit = RESTORATIONS_PAGE_SIZE,
    all = false,
  }: { limit?: number; all?: boolean } = {},
) {
  return {
    p_query: filters.q || undefined,
    p_status: filters.status ?? undefined,
    p_payment_status: filters.paymentStatus ?? undefined,
    p_payment_type: filters.paymentType ?? undefined,
    p_client_id: filters.clientId ?? undefined,
    p_workshop_id: filters.workshopId ?? undefined,
    p_from: filters.from ?? undefined,
    p_to: filters.to ?? undefined,
    p_sort: filters.sort,
    p_dir: filters.dir,
    p_limit: all
      ? RESTORATIONS_EXPORT_LIMIT
      : filters.view === "kanban"
        ? RESTORATIONS_KANBAN_LIMIT
        : limit,
    p_offset: all || filters.view === "kanban" ? 0 : (filters.page - 1) * limit,
  };
}
