import "server-only";

import type { DocumentType } from "@/domain/documents";
import { createClient } from "@/lib/supabase/server";
import type { SyncJobStatus } from "@/server/shopify-sync/jobs";

export type SyncState = {
  jobId: number;
  status: SyncJobStatus;
  lastError: string | null;
};

export type ClientListItem = {
  id: string;
  kind: "persona" | "empresa";
  displayName: string;
  documentType: DocumentType | null;
  documentNumber: string | null;
  phone: string | null;
  email: string | null;
  active: boolean;
  sync: SyncState | null;
};

/** Estado de sincronización con Shopify de varios registros de una tabla. */
export async function getSyncStates(
  table: "clients" | "contacts",
  ids: string[],
): Promise<Map<string, SyncState>> {
  if (ids.length === 0) return new Map();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("shopify_sync_status", {
    p_entity_table: table,
    p_entity_ids: ids,
  });
  if (error) throw error;
  return new Map(
    data.map((row) => [
      row.entity_id,
      {
        jobId: row.job_id,
        status: row.status as SyncJobStatus,
        lastError: row.last_error,
      },
    ]),
  );
}

/** Últimos clientes registrados (el listado completo con filtros llega en 6.5). */
export async function listRecentClients(limit = 50): Promise<ClientListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .select(
      "id, kind, display_name, document_type, document_number, phone, email, active",
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  const states = await getSyncStates(
    "clients",
    data.map((c) => c.id),
  );
  return data.map((c) => ({
    id: c.id,
    kind: c.kind,
    displayName: c.display_name ?? "",
    documentType: c.document_type,
    documentNumber: c.document_number,
    phone: c.phone,
    email: c.email,
    active: c.active,
    sync: states.get(c.id) ?? null,
  }));
}
