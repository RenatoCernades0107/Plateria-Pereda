import "server-only";

import {
  activeFilter,
  CLIENTS_PAGE_SIZE,
  type ClientFilters,
} from "@/domain/client-filters";
import type { DocumentType } from "@/domain/documents";
import { createClient } from "@/lib/supabase/server";
import type { SyncJobStatus } from "@/server/shopify-sync/jobs";

export type SyncState = {
  /** null: importado de Shopify, sin jobs (no hay nada que reintentar). */
  jobId: number | null;
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

export type ClientsPage = {
  clients: ClientListItem[];
  total: number;
  pages: number;
};

const SYNCED: SyncState = { jobId: null, status: "ok", lastError: null };

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

/** Listado con búsqueda, filtros y paginación (función `list_clients` de la BD). */
export async function listClients(
  filters: ClientFilters,
): Promise<ClientsPage> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_clients", {
    p_query: filters.q || undefined,
    p_kind: filters.kind ?? undefined,
    p_sync: filters.sync ?? undefined,
    p_active: activeFilter(filters.status) ?? undefined,
    p_limit: CLIENTS_PAGE_SIZE,
    p_offset: (filters.page - 1) * CLIENTS_PAGE_SIZE,
  });
  if (error) throw error;
  const total = Number(data[0]?.total_count ?? 0);
  return {
    total,
    pages: Math.max(1, Math.ceil(total / CLIENTS_PAGE_SIZE)),
    clients: data.map((c) => ({
      id: c.id,
      kind: c.kind,
      displayName: c.display_name ?? "",
      documentType: c.document_type,
      documentNumber: c.document_number,
      phone: c.phone,
      email: c.email,
      active: c.active,
      sync: c.sync_status
        ? {
            jobId: c.job_id,
            status: c.sync_status as SyncJobStatus,
            lastError: c.last_error,
          }
        : null,
    })),
  };
}

export type ContactDetail = {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string;
  position: string;
  documentType: Exclude<DocumentType, "ruc"> | null;
  documentNumber: string | null;
  phone: string | null;
  email: string | null;
  active: boolean;
  sync: SyncState | null;
};

export type ClientDetail = {
  id: string;
  kind: "persona" | "empresa";
  displayName: string;
  firstName: string;
  lastName: string;
  legalName: string;
  documentType: DocumentType | null;
  documentNumber: string | null;
  phone: string | null;
  email: string | null;
  address: string;
  city: string;
  region: string | null;
  notes: string;
  active: boolean;
  createdAt: string;
  sync: SyncState | null;
  contacts: ContactDetail[];
};

/** Datos de un cliente con sus contactos y el estado de sincronización de cada uno. */
export async function getClientDetail(
  id: string,
): Promise<ClientDetail | null> {
  const supabase = await createClient();
  const { data: c, error } = await supabase
    .from("clients")
    .select("*, contacts(*)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!c) return null;

  const contacts = [...c.contacts].sort(
    (a, b) =>
      Number(b.active) - Number(a.active) ||
      a.display_name!.localeCompare(b.display_name!, "es"),
  );
  const [clientStates, contactStates] = await Promise.all([
    getSyncStates("clients", [c.id]),
    getSyncStates(
      "contacts",
      contacts.map((k) => k.id),
    ),
  ]);
  const synced = c.shopify_customer_id ?? c.shopify_company_id;

  return {
    id: c.id,
    kind: c.kind,
    displayName: c.display_name ?? "",
    firstName: c.first_name,
    lastName: c.last_name,
    legalName: c.legal_name,
    documentType: c.document_type,
    documentNumber: c.document_number,
    phone: c.phone,
    email: c.email,
    address: c.address,
    city: c.city,
    region: c.region,
    notes: c.notes,
    active: c.active,
    createdAt: c.created_at,
    sync: clientStates.get(c.id) ?? (synced ? SYNCED : null),
    contacts: contacts.map((k) => ({
      id: k.id,
      firstName: k.first_name,
      lastName: k.last_name,
      displayName: k.display_name ?? "",
      position: k.position,
      documentType: k.document_type as ContactDetail["documentType"],
      documentNumber: k.document_number,
      phone: k.phone,
      email: k.email,
      active: k.active,
      sync: contactStates.get(k.id) ?? (k.shopify_customer_id ? SYNCED : null),
    })),
  };
}
