import { appendAll, list, manyOf, type SearchParams } from "./filter-params";

/** Filtros del listado de clientes, leídos de la URL (`/clientes?q=…&tipo=…`). */

export const CLIENTS_PAGE_SIZE = 25;

export const SYNC_FILTERS = ["ok", "pending", "error"] as const;
export type SyncFilter = (typeof SYNC_FILTERS)[number];

export const KIND_FILTERS = ["persona", "empresa"] as const;
export type KindFilter = (typeof KIND_FILTERS)[number];

export const STATUS_FILTERS = ["activos", "inactivos"] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

/** Valor de `estado` en la URL cuando no se elige ninguno (activos e inactivos). */
const ALL_STATUSES = "todos";

export type ClientFilters = {
  q: string;
  /** Varios tipos a la vez (`[]` = todos). */
  kind: KindFilter[];
  /** Varios estados de sincronización a la vez (`[]` = todos). */
  sync: SyncFilter[];
  /** Por defecto, solo activos; `[]` = activos e inactivos. */
  status: StatusFilter[];
  page: number;
};

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? "";

export function parseClientFilters(params: SearchParams): ClientFilters {
  const page = Number.parseInt(first(params.pagina), 10);
  return {
    q: first(params.q).trim().slice(0, 100),
    kind: manyOf(KIND_FILTERS, params.tipo),
    sync: manyOf(SYNC_FILTERS, params.sync),
    status: list(params.estado).includes(ALL_STATUSES)
      ? []
      : (() => {
          const status = manyOf(STATUS_FILTERS, params.estado);
          return status.length ? status : ["activos"];
        })(),
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
  appendAll(params, "tipo", next.kind);
  appendAll(params, "sync", next.sync);
  if (next.status.length === 0) params.set("estado", ALL_STATUSES);
  else if (!(next.status.length === 1 && next.status[0] === "activos"))
    appendAll(params, "estado", next.status);
  if (next.page > 1) params.set("pagina", String(next.page));
  const query = params.toString();
  return query ? `/clientes?${query}` : "/clientes";
}

/** `active` para la consulta: true, false o null (todos). */
export function activeFilter(status: readonly StatusFilter[]): boolean | null {
  return status.length === 1 ? status[0] === "activos" : null;
}
