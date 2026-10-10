import "server-only";

import { toCents, type Cents, type PaymentType } from "@/domain/money";
import {
  listWhatsappQuotesArgs,
  WHATSAPP_QUOTES_PAGE_SIZE,
  type WhatsappQuoteFilters,
  type WhatsappQuoteStatus,
} from "@/domain/whatsapp-quotes";
import { createClient } from "@/lib/supabase/server";

export type WhatsappQuoteItem = {
  id: string;
  number: number;
  description: string;
  measure: string;
  materialId: string | null;
  materialName: string;
  serviceId: string | null;
  serviceName: string;
  weightGrams: number | null;
  priceCents: Cents;
  notes: string;
  /** Restauración en la que se pidió (pieza viva); null = pendiente. */
  order: {
    restorationId: string;
    restorationCode: string;
    pieceCode: string;
  } | null;
};

export type WhatsappQuoteDetail = {
  id: string;
  code: string;
  status: WhatsappQuoteStatus;
  client: {
    id: string;
    name: string;
    phone: string | null;
    kind: "persona" | "empresa";
  } | null;
  contact: { id: string; name: string; phone: string | null } | null;
  customerName: string;
  customerPhone: string;
  paymentType: PaymentType;
  depositPercent: number | null;
  /** Si es false, cada pieza se cobra con el 18 % de IGV encima (P13). */
  pricesIncludeIgv: boolean;
  notes: string;
  /** Con IGV. */
  totalCents: Cents;
  discardedAt: string | null;
  discardReason: string | null;
  createdAt: string;
  items: WhatsappQuoteItem[];
  /** Restauraciones copiadas de esta cotización (aunque luego se anulen). */
  restorations: { id: string; code: string; createdAt: string }[];
};

/** Detalle de una cotización (admin y ventas; la RLS lo exige). */
export async function getWhatsappQuote(
  id: string,
): Promise<WhatsappQuoteDetail | null> {
  const supabase = await createClient();
  const { data: q, error } = await supabase
    .from("whatsapp_quotes")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!q) return null;

  const [items, orders, client, contact, restorations] = await Promise.all([
    supabase
      .from("whatsapp_quote_items")
      .select("*")
      .eq("quote_id", id)
      .order("number"),
    supabase.rpc("whatsapp_quote_item_orders", { p_quote_id: id }),
    q.client_id
      ? supabase
          .from("clients")
          .select("id, display_name, phone, kind")
          .eq("id", q.client_id)
          .single()
      : Promise.resolve({ data: null, error: null }),
    q.contact_id
      ? supabase
          .from("contacts")
          .select("id, display_name, phone")
          .eq("id", q.contact_id)
          .single()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("restorations")
      .select("id, code, created_at")
      .eq("whatsapp_quote_id", id)
      .order("created_at"),
  ]);
  for (const result of [items, orders, client, contact, restorations]) {
    if (result.error) throw result.error;
  }
  const orderOf = new Map(
    (orders.data ?? []).map((o) => [
      o.item_id,
      {
        restorationId: o.restoration_id,
        restorationCode: o.restoration_code,
        pieceCode: o.piece_code,
      },
    ]),
  );

  return {
    id: q.id,
    code: q.code,
    status: q.status,
    client: client.data
      ? {
          id: client.data.id,
          name: client.data.display_name ?? "",
          phone: client.data.phone,
          kind: client.data.kind,
        }
      : null,
    contact: contact.data
      ? {
          id: contact.data.id,
          name: contact.data.display_name ?? "",
          phone: contact.data.phone,
        }
      : null,
    customerName: q.customer_name,
    customerPhone: q.customer_phone,
    paymentType: q.payment_type,
    depositPercent:
      q.deposit_percent === null ? null : Number(q.deposit_percent),
    pricesIncludeIgv: q.prices_include_igv,
    notes: q.notes,
    totalCents: toCents(Number(q.total)),
    discardedAt: q.discarded_at,
    discardReason: q.discard_reason,
    createdAt: q.created_at,
    items: items.data!.map((i) => ({
      id: i.id,
      number: i.number,
      description: i.description,
      measure: i.measure,
      materialId: i.material_id,
      materialName: i.material_name,
      serviceId: i.service_id,
      serviceName: i.service_name,
      weightGrams: i.weight_grams === null ? null : Number(i.weight_grams),
      priceCents: toCents(Number(i.price)),
      notes: i.notes,
      order: orderOf.get(i.id) ?? null,
    })),
    restorations: restorations.data!.map((r) => ({
      id: r.id,
      code: r.code,
      createdAt: r.created_at,
    })),
  };
}

export type WhatsappQuoteListItem = {
  id: string;
  code: string;
  clientId: string | null;
  /** Cliente, o el nombre anotado si aún no hay cliente. */
  name: string;
  contactName: string | null;
  customerPhone: string;
  status: WhatsappQuoteStatus;
  itemsCount: number;
  pendingCount: number;
  totalCents: Cents;
  createdAt: string;
};

/** Listado con filtros y paginación (`list_whatsapp_quotes`). */
export async function listWhatsappQuotes(
  filters: WhatsappQuoteFilters,
  { limit = WHATSAPP_QUOTES_PAGE_SIZE }: { limit?: number } = {},
): Promise<{ items: WhatsappQuoteListItem[]; total: number; pages: number }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "list_whatsapp_quotes",
    listWhatsappQuotesArgs(filters, limit),
  );
  if (error) throw error;
  const total = Number(data[0]?.total_count ?? 0);
  return {
    total,
    pages: Math.max(1, Math.ceil(total / limit)),
    items: data.map((q) => ({
      id: q.id,
      code: q.code,
      clientId: q.client_id,
      name: q.client_name ?? q.customer_name,
      contactName: q.contact_name,
      customerPhone: q.customer_phone,
      status: q.status,
      itemsCount: q.items_count,
      pendingCount: q.pending_count,
      totalCents: toCents(Number(q.total)),
      createdAt: q.created_at,
    })),
  };
}
