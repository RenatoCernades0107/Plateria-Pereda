import { PAYMENT_KINDS, type PaymentKind } from "./payments";

/**
 * Filtros de la vista de pagos de restauraciones (`/restauraciones/pagos?…`): pagos y
 * reembolsos de todas las guías, del más reciente al más antiguo.
 */

export const PAYMENTS_PAGE_SIZE = 50;
/** Tope de filas del CSV de pagos. */
export const PAYMENTS_EXPORT_LIMIT = 10000;

export const PAYMENTS_PATH = "/restauraciones/pagos";

export type PaymentListFilters = {
  /** Código de la guía, cliente, documento o pedido de Shopify. */
  q: string;
  /** Pago o reembolso: `[]` = los dos. */
  kind: PaymentKind[];
  /** Nombres de método (Efectivo, Yape, la pasarela de Shopify…). */
  methods: string[];
  branchIds: string[];
  /** Fecha del pago (AAAA-MM-DD, inclusive). */
  from: string | null;
  to: string | null;
  page: number;
};

type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? "";

const list = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value : value ? [value] : [];

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

export function parsePaymentListFilters(
  params: SearchParams,
): PaymentListFilters {
  const page = Number.parseInt(first(params.pagina), 10);
  const kinds = new Set(list(params.tipo));
  return {
    q: first(params.q).trim().slice(0, 100),
    kind: PAYMENT_KINDS.filter((k) => kinds.has(k)),
    methods: [
      ...new Set(
        list(params.metodo)
          .map((m) => m.trim().slice(0, 100))
          .filter(Boolean),
      ),
    ],
    branchIds: [
      ...new Set(
        list(params.sucursal)
          .filter((v) => UUID.test(v))
          .map((v) => v.toLowerCase()),
      ),
    ],
    from: isoDate(first(params.desde)),
    to: isoDate(first(params.hasta)),
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

/** Parámetros de la URL con esos filtros (omite los vacíos). */
export function paymentListQuery(
  filters: PaymentListFilters,
  changes: Partial<PaymentListFilters> = {},
): string {
  const next = { ...filters, ...changes };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  next.kind.forEach((v) => params.append("tipo", v));
  next.methods.forEach((v) => params.append("metodo", v));
  next.branchIds.forEach((v) => params.append("sucursal", v));
  if (next.from) params.set("desde", next.from);
  if (next.to) params.set("hasta", next.to);
  if (next.page > 1) params.set("pagina", String(next.page));
  return params.toString();
}

export function paymentListHref(
  filters: PaymentListFilters,
  changes: Partial<PaymentListFilters> = {},
): string {
  const query = paymentListQuery(filters, changes);
  return query ? `${PAYMENTS_PATH}?${query}` : PAYMENTS_PATH;
}

/** Argumentos de `list_payments()` para esos filtros (`all`: el CSV, sin paginar). */
export function listPaymentsArgs(
  filters: PaymentListFilters,
  { all = false }: { all?: boolean } = {},
) {
  return {
    p_query: filters.q || undefined,
    p_kind: filters.kind.length ? filters.kind : undefined,
    p_methods: filters.methods.length ? filters.methods : undefined,
    p_branch_ids: filters.branchIds.length ? filters.branchIds : undefined,
    p_from: filters.from ?? undefined,
    p_to: filters.to ?? undefined,
    p_limit: all ? PAYMENTS_EXPORT_LIMIT : PAYMENTS_PAGE_SIZE,
    p_offset: all ? 0 : (filters.page - 1) * PAYMENTS_PAGE_SIZE,
  };
}
