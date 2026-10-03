import "server-only";

import type { AuditAction, AuditChanges, AuditEntry } from "@/domain/audit";
import {
  AUDIT_PAGE_SIZE,
  limaDayEnd,
  limaDayStart,
  SYSTEM_ACTOR_FILTER,
  type AuditFilters,
} from "@/lib/audit-filters";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

type AuditRow = Database["public"]["Tables"]["audit_log"]["Row"];

function toEntry(row: AuditRow): AuditEntry {
  return {
    id: row.id,
    occurredAt: row.occurred_at,
    actorName: row.actor_id ? (row.actor_name ?? "Usuario eliminado") : null,
    table: row.table_name,
    recordId: row.record_id,
    action: row.action as AuditAction,
    changes: row.changes as AuditChanges,
  };
}

/** Página de /auditoria con los filtros aplicados (RLS: solo admin). */
export async function listAuditLog(filters: AuditFilters) {
  const supabase = await createClient();
  const offset = (filters.page - 1) * AUDIT_PAGE_SIZE;

  let query = supabase
    .from("audit_log")
    .select("*", { count: "exact" })
    .order("occurred_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + AUDIT_PAGE_SIZE - 1);

  if (filters.actor === SYSTEM_ACTOR_FILTER) query = query.is("actor_id", null);
  else if (filters.actor) query = query.eq("actor_id", filters.actor);
  if (filters.entity) query = query.eq("table_name", filters.entity);
  if (filters.action) query = query.eq("action", filters.action);
  if (filters.from)
    query = query.gte("occurred_at", limaDayStart(filters.from));
  if (filters.to) query = query.lt("occurred_at", limaDayEnd(filters.to));

  const { data, error, count } = await query;
  // Una página fuera de rango responde con error de rango: se muestra vacía.
  if (error && error.code !== "PGRST103") throw error;

  const total = count ?? 0;
  return {
    entries: (data ?? []).map(toEntry),
    total,
    pages: Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE)),
  };
}

/** Historial de un registro, del más reciente al más antiguo. */
export async function getEntityHistory(table: string, recordId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("audit_log")
    .select("*")
    .eq("table_name", table)
    .eq("record_id", recordId)
    .order("occurred_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(200);
  if (error) throw error;
  return data.map(toEntry);
}
