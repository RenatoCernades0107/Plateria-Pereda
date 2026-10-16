import "server-only";

import type { ClientOption } from "@/domain/client-search";
import { toCents, toDecimalString, type Cents } from "@/domain/money";
import {
  QUOTES_PAGE_SIZE,
  searchTerm,
  type QuoteFilters,
} from "@/domain/quote-filters";
import {
  addDays,
  limaDateOf,
  quoteDisplayStatus,
  type QuoteDisplayStatus,
  type QuoteStatus,
} from "@/domain/quote";
import type { QuoteLineDraft } from "@/domain/quote-line";
import { createClient } from "@/lib/supabase/server";

export type QuoteListItem = {
  id: string;
  code: string;
  status: QuoteDisplayStatus;
  clientName: string;
  contactName: string | null;
  issueDate: string | null;
  validUntil: string | null;
  total: Cents;
  createdAt: string;
};

export type QuotesPage = {
  quotes: QuoteListItem[];
  total: number;
  pages: number;
};

/** Inicio de un día calendario de Lima (UTC−5 todo el año). */
const limaStart = (date: string) => `${date}T00:00:00-05:00`;

/** Listado con búsqueda (código o cliente), filtros y paginación. */
export async function listQuotes(filters: QuoteFilters): Promise<QuotesPage> {
  const supabase = await createClient();
  const today = limaDateOf(new Date());
  let query = supabase
    .from("quotes")
    .select(
      "id, code, status, client_name, contact_name, issue_date, valid_until, total, created_at",
      { count: "exact" },
    );

  const term = searchTerm(filters.q);
  if (term) {
    query = query.or(`code.ilike.*${term}*,client_name.ilike.*${term}*`);
  }
  switch (filters.status) {
    case null:
      break;
    case "emitida":
      query = query.eq("status", "emitida").gte("valid_until", today);
      break;
    case "vencida":
      query = query.eq("status", "emitida").lt("valid_until", today);
      break;
    default:
      query = query.eq("status", filters.status);
  }
  if (filters.clientId) query = query.eq("client_id", filters.clientId);
  if (filters.from) query = query.gte("created_at", limaStart(filters.from));
  if (filters.to) {
    query = query.lt("created_at", limaStart(addDays(filters.to, 1)));
  }

  const offset = (filters.page - 1) * QUOTES_PAGE_SIZE;
  const { data, count, error } = await query
    .order("created_at", { ascending: false })
    .order("number", { ascending: false })
    .range(offset, offset + QUOTES_PAGE_SIZE - 1);
  if (error) throw error;

  const total = count ?? 0;
  return {
    total,
    pages: Math.max(1, Math.ceil(total / QUOTES_PAGE_SIZE)),
    quotes: data.map((q) => ({
      id: q.id,
      code: q.code ?? "",
      status: quoteDisplayStatus(q.status, q.valid_until),
      clientName: q.client_name,
      contactName: q.contact_name,
      issueDate: q.issue_date,
      validUntil: q.valid_until,
      total: toCents(Number(q.total)),
      createdAt: q.created_at,
    })),
  };
}

export type QuoteDetail = {
  id: string;
  code: string;
  status: QuoteStatus;
  displayStatus: QuoteDisplayStatus;
  client: ClientOption;
  validityDays: number;
  issueDate: string | null;
  validUntil: string | null;
  notes: string;
  terms: string;
  total: Cents;
  duplicatedFrom: { id: string; code: string } | null;
  lines: QuoteLineDraft[];
};

const money = (value: number | null) =>
  value === null ? null : toDecimalString(toCents(Number(value)));

/** Cotización con sus líneas, lista para el formulario. */
export async function getQuote(id: string): Promise<QuoteDetail | null> {
  const supabase = await createClient();
  const { data: q, error } = await supabase
    .from("quotes")
    .select(
      "*, quote_items(*), clients(id, kind, display_name, document_type, document_number, phone, email, shopify_customer_id), contacts(id, display_name, phone, email, shopify_customer_id), source:duplicated_from(id, code)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!q) return null;

  const c = q.clients!;
  // Mientras es borrador se muestran los datos vigentes; emitida, los copiados.
  const issued = q.status !== "borrador";
  const client: ClientOption = q.contacts
    ? {
        source: "local",
        kind: "contacto",
        clientId: c.id,
        contactId: q.contacts.id,
        name: issued ? (q.contact_name ?? "") : (q.contacts.display_name ?? ""),
        companyName: issued ? q.client_name : (c.display_name ?? ""),
        phone: issued ? q.contact_phone : q.contacts.phone,
        email: issued ? q.contact_email : q.contacts.email,
        shopifyCustomerId: q.contacts.shopify_customer_id,
      }
    : {
        source: "local",
        kind: c.kind,
        clientId: c.id,
        name: issued ? q.client_name : (c.display_name ?? ""),
        documentType: issued ? q.client_document_type : c.document_type,
        documentNumber: issued ? q.client_document_number : c.document_number,
        phone: issued ? q.client_phone : c.phone,
        email: issued ? q.client_email : c.email,
        shopifyCustomerId: c.shopify_customer_id,
      };

  const source = q.source as { id: string; code: string | null } | null;

  return {
    id: q.id,
    code: q.code ?? "",
    status: q.status,
    displayStatus: quoteDisplayStatus(q.status, q.valid_until),
    client,
    validityDays: q.validity_days,
    issueDate: q.issue_date,
    validUntil: q.valid_until,
    notes: q.notes,
    terms: q.terms,
    total: toCents(Number(q.total)),
    duplicatedFrom: source ? { id: source.id, code: source.code ?? "" } : null,
    lines: [...q.quote_items]
      .sort((a, b) => a.position - b.position)
      .map((item) => ({
        key: item.id,
        shopifyProductId: item.shopify_product_id,
        shopifyVariantId: item.shopify_variant_id,
        title: item.title,
        variantTitle: item.variant_title,
        sku: item.sku,
        imageUrl: item.image_url,
        catalogPrice: money(item.catalog_price),
        customization: item.customization,
        quantity: String(item.quantity),
        unitPrice: money(item.unit_price) ?? "0.00",
        discountType: (item.discount_type ??
          "") as QuoteLineDraft["discountType"],
        discountValue:
          item.discount_type === "monto"
            ? (money(item.discount_value) ?? "")
            : item.discount_type === "porcentaje"
              ? String(Number(item.discount_value))
              : "",
      })),
  };
}

/** Nombre de un cliente (para mostrar el filtro por cliente del listado). */
export async function getClientName(id: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .select("display_name")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data?.display_name ?? null;
}
