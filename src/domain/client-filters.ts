/** Filtros del listado de clientes, leídos de la URL (`/clientes?q=…&tipo=…`). */

export const CLIENTS_PAGE_SIZE = 25;

export const SYNC_FILTERS = ["ok", "pending", "error"] as const;
export type SyncFilter = (typeof SYNC_FILTERS)[number];

export const STATUS_FILTERS = ["activos", "inactivos", "todos"] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

export type ClientFilters = {
  q: string;
  kind: "persona" | "empresa" | null;
  sync: SyncFilter | null;
  status: StatusFilter;
  page: number;
};

type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? "";

const oneOf = <T extends string>(options: readonly T[], value: string) =>
  (options as readonly string[]).includes(value) ? (value as T) : null;

export function parseClientFilters(params: SearchParams): ClientFilters {
  const page = Number.parseInt(first(params.pagina), 10);
  return {
    q: first(params.q).trim().slice(0, 100),
    kind: oneOf(["persona", "empresa"] as const, first(params.tipo)),
    sync: oneOf(SYNC_FILTERS, first(params.sync)),
    status: oneOf(STATUS_FILTERS, first(params.estado)) ?? "activos",
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

/** URL del listado con esos filtros (omite los valores por defecto). */
export function clientFiltersHref(
  filters: ClientFilters,
  changes: Partial<ClientFilters> = {},
): string {
  const next = { ...filters, ...changes };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.kind) params.set("tipo", next.kind);
  if (next.sync) params.set("sync", next.sync);
  if (next.status !== "activos") params.set("estado", next.status);
  if (next.page > 1) params.set("pagina", String(next.page));
  const query = params.toString();
  return query ? `/clientes?${query}` : "/clientes";
}

/** `active` para la consulta: true, false o null (todos). */
export function activeFilter(status: StatusFilter): boolean | null {
  return status === "todos" ? null : status === "activos";
}
