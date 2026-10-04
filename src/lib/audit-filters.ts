import { z } from "zod";

import type { AuditAction } from "@/domain/audit";

export const AUDIT_PAGE_SIZE = 25;

export const SYSTEM_ACTOR_FILTER = "sistema";

/** Filtros de /auditoria. En la URL: usuario, entidad, accion, desde, hasta y pagina. */
export type AuditFilters = {
  actor?: string;
  entity?: string;
  action?: AuditAction;
  from?: string;
  to?: string;
  page: number;
};

type SearchParams = Record<string, string | string[] | undefined>;

const isoDate = z.iso.date();

const schema = z.object({
  // guid y no uuid: Postgres acepta ids sin los bits de versión (como los de las semillas).
  usuario: z.union([z.guid(), z.literal(SYSTEM_ACTOR_FILTER)]).optional(),
  entidad: z
    .string()
    .regex(/^[a-z_]+$/)
    .optional(),
  accion: z.enum(["insert", "update", "delete"]).optional(),
  desde: isoDate.optional(),
  hasta: isoDate.optional(),
  pagina: z.coerce.number().int().min(1).optional(),
});

/** Lee los filtros de la URL; un valor inválido se ignora. */
export function parseAuditFilters(searchParams: SearchParams): AuditFilters {
  const value = (key: keyof typeof schema.shape) => {
    const raw = searchParams[key];
    const first = Array.isArray(raw) ? raw[0] : raw;
    const parsed = schema.shape[key].safeParse(first || undefined);
    return parsed.success ? parsed.data : undefined;
  };

  const filters: AuditFilters = {
    actor: value("usuario") as string | undefined,
    entity: value("entidad") as string | undefined,
    action: value("accion") as AuditAction | undefined,
    from: value("desde") as string | undefined,
    to: value("hasta") as string | undefined,
    page: (value("pagina") as number | undefined) ?? 1,
  };
  return Object.fromEntries(
    Object.entries(filters).filter(([, v]) => v !== undefined),
  ) as AuditFilters;
}

/** Arma la query string de los filtros, sin los vacíos ni la página 1. */
export function serializeAuditFilters(filters: Partial<AuditFilters>): string {
  const params = new URLSearchParams();
  const entries: [string, string | number | undefined][] = [
    ["usuario", filters.actor],
    ["entidad", filters.entity],
    ["accion", filters.action],
    ["desde", filters.from],
    ["hasta", filters.to],
    ["pagina", filters.page && filters.page > 1 ? filters.page : undefined],
  ];
  for (const [key, value] of entries) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  return params.toString();
}

export function auditHref(filters: Partial<AuditFilters>): string {
  const query = serializeAuditFilters(filters);
  return query ? `/auditoria?${query}` : "/auditoria";
}

/** Inicio de un día de Lima (UTC−5, sin horario de verano) en ISO. */
export function limaDayStart(date: string): string {
  return new Date(`${date}T00:00:00-05:00`).toISOString();
}

/** Inicio del día siguiente de Lima: límite exclusivo para "hasta". */
export function limaDayEnd(date: string): string {
  return new Date(
    new Date(`${date}T00:00:00-05:00`).getTime() + 24 * 60 * 60 * 1000,
  ).toISOString();
}
