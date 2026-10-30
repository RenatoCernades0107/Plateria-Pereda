import "server-only";

import {
  openSyncErrors,
  syncErrorLink,
  type SyncErrorLink,
  type SyncJobRow,
} from "@/domain/shopify-sync-errors";
import { createClient } from "@/lib/supabase/server";

/** Cuántos errores se enlazan en el aviso (el resto solo se cuenta). */
const SHOWN = 5;

export type SyncErrorSummary = { total: number; links: SyncErrorLink[] };

/**
 * Sincronizaciones con Shopify en error que siguen vigentes (sin un job posterior
 * completado y de registros que aún existen), para el aviso del admin. Solo el admin
 * lee el outbox: con otro rol la consulta no trae filas.
 */
export async function shopifySyncErrors(): Promise<SyncErrorSummary> {
  const supabase = await createClient();
  const { data: errors, error } = await supabase
    .from("shopify_sync_jobs")
    .select("entity_id")
    .eq("status", "error")
    .limit(200);
  if (error || errors.length === 0) return { total: 0, links: [] };

  // Los jobs completados de esos mismos registros dicen si el error ya se resolvió.
  const { data: jobs, error: jobsError } = await supabase
    .from("shopify_sync_jobs")
    .select("id, kind, entity_table, entity_id, status, created_at, last_error")
    .in("status", ["error", "ok"])
    .in("entity_id", [...new Set(errors.map((e) => e.entity_id))])
    .order("created_at", { ascending: false });
  if (jobsError) return { total: 0, links: [] };

  const open = openSyncErrors(
    jobs.map((j): SyncJobRow => ({
      id: j.id,
      kind: j.kind,
      entityTable: j.entity_table,
      entityId: j.entity_id,
      status: j.status,
      createdAt: j.created_at,
      lastError: j.status === "error" ? j.last_error : undefined,
    })),
  );
  const idsOf = (table: string) =>
    open.filter((j) => j.entityTable === table).map((j) => j.entityId);

  const [restorations, clients, contacts] = await Promise.all([
    supabase
      .from("restorations")
      .select("id, code")
      .in("id", idsOf("restorations")),
    supabase
      .from("clients")
      .select("id, display_name, merged_into")
      .in("id", idsOf("clients")),
    supabase
      .from("contacts")
      .select("id, client_id, display_name")
      .in("id", idsOf("contacts")),
  ]);
  const names = new Map<string, string>();
  const existing = new Set<string>();
  for (const r of restorations.data ?? []) {
    existing.add(r.id);
    names.set(r.id, r.code);
  }
  // Un duplicado fusionado ya no importa en Shopify: su error deja de contar.
  const liveClients = (clients.data ?? []).filter((c) => !c.merged_into);
  for (const c of [...liveClients, ...(contacts.data ?? [])]) {
    existing.add(c.id);
    if (c.display_name) names.set(c.id, c.display_name);
  }
  const clientOf = new Map(
    (contacts.data ?? []).map((c) => [c.id, c.client_id] as const),
  );
  // El job de un registro que ya se borró (o se fusionó) no hace falta reintentarlo.
  const live = open.filter((job) => existing.has(job.entityId));
  const shown = live.slice(0, SHOWN);

  return {
    total: live.length,
    links: shown.map((job) => syncErrorLink(job, names, clientOf)),
  };
}
