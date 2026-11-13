import "server-only";

import type { ClientOption } from "@/domain/client-search";
import { quoteBalance, quotePaymentStatus } from "@/domain/quote-payments";
import {
  NO_WORKSHOP,
  TRACKING_PAGE_SIZE,
  type TrackingFilters,
} from "@/domain/quote-tracking-filters";
import type { QuoteWorkLocation } from "@/domain/quote-tracking";
import type { PaymentStatus } from "@/domain/money";
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
  type QuotePaymentCondition,
  type QuoteStatus,
} from "@/domain/quote";
import type {
  QuoteIssuer,
  QuoteIssuerDocumentType,
} from "@/domain/quote-issuers";
import { QUOTE_IMAGES_BUCKET } from "@/domain/quote-images";
import type { QuoteLineDraft } from "@/domain/quote-line";
import type { QuotePdfClientDocument } from "@/domain/quote-pdf";
import type { WorkshopQuote } from "@/domain/quote-workshop-pdf";
import type { Tables } from "@/lib/supabase/database.types";
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
  /** Fechas de entrega al cliente y del proveedor (solo en las aceptadas). */
  deliveryDate: string | null;
  supplierDeliveryDate: string | null;
  /** Ubicación del trabajo y taller (solo en las aceptadas y facturadas). */
  workLocation: QuoteWorkLocation | null;
  workshopName: string | null;
};

export type QuotesPage = {
  quotes: QuoteListItem[];
  total: number;
  pages: number;
};

/** Inicio de un día calendario de Lima (UTC−5 todo el año). */
const limaStart = (date: string) => `${date}T00:00:00-05:00`;

/** Listado con búsqueda (código o cliente), filtros y paginación. */
export async function listQuotes(
  filters: QuoteFilters,
  { limit = QUOTES_PAGE_SIZE }: { limit?: number } = {},
): Promise<QuotesPage> {
  const supabase = await createClient();
  const today = limaDateOf(new Date());
  let query = supabase
    .from("quotes")
    .select(
      "id, code, status, client_name, contact_name, issue_date, valid_until, total, created_at, delivery_date, supplier_delivery_date, work_location, workshops(name)",
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

  const offset = (filters.page - 1) * limit;
  const { data, count, error } = await query
    .order("created_at", { ascending: false })
    .order("number", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;

  const total = count ?? 0;
  return {
    total,
    pages: Math.max(1, Math.ceil(total / limit)),
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
      deliveryDate: q.delivery_date,
      supplierDeliveryDate: q.supplier_delivery_date,
      workLocation: q.work_location,
      workshopName: q.workshops?.name ?? null,
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
  paymentCondition: QuotePaymentCondition;
  /** Días de crédito; null si la condición no es crédito. */
  creditDays: number | null;
  /** Sucursal que emite (razón social, RUC y cuenta del PDF). */
  issuer: QuoteIssuer | null;
  deliveryDays: number;
  /** Fechas de entrega al cliente y del proveedor (solo en las aceptadas). */
  deliveryDate: string | null;
  supplierDeliveryDate: string | null;
  /** Ubicación del trabajo y taller (solo en las aceptadas y facturadas). */
  workLocation: QuoteWorkLocation | null;
  workshop: { id: string; name: string } | null;
  applyIgv: boolean;
  issueDate: string | null;
  validUntil: string | null;
  notes: string;
  terms: string;
  /** Instrucciones para el taller (PDF «Orden para taller»). */
  workshopNotes: string;
  total: Cents;
  duplicatedFrom: { id: string; code: string } | null;
  /**
   * Documento y teléfono del PDF: RUC de la empresa (o documento de la persona) y
   * teléfono del contacto (o del cliente). En las emitidas se usan los datos copiados
   * al emitir y, si faltan, los actuales (p. ej., un teléfono agregado después).
   */
  pdfClient: {
    document: QuotePdfClientDocument | null;
    phone: string | null;
  };
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
      "*, quote_items(*), clients(id, kind, display_name, document_type, document_number, phone, contact_phone, email, shopify_customer_id), contacts(id, display_name, phone, email, shopify_customer_id), source:duplicated_from(id, code), quote_issuers(*), workshops(id, name)",
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
        phone: issued ? q.client_phone : (c.phone ?? c.contact_phone),
        email: issued ? q.client_email : c.email,
        shopifyCustomerId: c.shopify_customer_id,
      };

  const source = q.source as { id: string; code: string | null } | null;

  const currentClientPhone = c.phone ?? c.contact_phone;
  const documentType =
    (issued ? q.client_document_type : null) ?? c.document_type;
  const documentNumber =
    (issued ? q.client_document_number : null) ?? c.document_number;
  const clientPhone = (issued ? q.client_phone : null) ?? currentClientPhone;
  const pdfPhone = q.contacts
    ? ((issued ? q.contact_phone : null) ?? q.contacts.phone ?? clientPhone)
    : clientPhone;

  const items = [...q.quote_items].sort((a, b) => a.position - b.position);
  const imageUrls = await signedQuoteImageUrls(
    supabase,
    items.map((item) => item.reference_image_path),
  );

  return {
    id: q.id,
    code: q.code ?? "",
    status: q.status,
    displayStatus: quoteDisplayStatus(q.status, q.valid_until),
    client,
    validityDays: q.validity_days,
    paymentCondition: q.payment_condition,
    creditDays: q.credit_days,
    issuer: q.quote_issuers ? toQuoteIssuer(q.quote_issuers) : null,
    deliveryDays: q.delivery_days,
    deliveryDate: q.delivery_date,
    supplierDeliveryDate: q.supplier_delivery_date,
    workLocation: q.work_location,
    workshop: q.workshops
      ? { id: q.workshops.id, name: q.workshops.name }
      : null,
    applyIgv: q.apply_igv,
    issueDate: q.issue_date,
    validUntil: q.valid_until,
    notes: q.notes,
    terms: q.terms,
    workshopNotes: q.workshop_notes,
    total: toCents(Number(q.total)),
    duplicatedFrom: source ? { id: source.id, code: source.code ?? "" } : null,
    pdfClient: {
      document:
        documentType && documentNumber
          ? { type: documentType, number: documentNumber }
          : null,
      phone: pdfPhone,
    },
    lines: items.map((item) => ({
      key: item.id,
      shopifyProductId: item.shopify_product_id,
      shopifyVariantId: item.shopify_variant_id,
      title: item.title,
      variantTitle: item.variant_title,
      sku: item.sku,
      imageUrl: item.image_url,
      referenceImagePath: item.reference_image_path,
      referenceImageUrl: item.reference_image_path
        ? (imageUrls.get(item.reference_image_path) ?? null)
        : null,
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

/**
 * Cotizaciones elegidas para la orden para taller, por número, con sus productos y la
 * foto de cada uno (la referencial firmada o, si no hay, la de Shopify).
 */
export async function listWorkshopQuotes(
  ids: readonly string[],
): Promise<WorkshopQuote[]> {
  if (ids.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quotes")
    .select(
      "id, code, status, valid_until, client_name, issue_date, delivery_date, supplier_delivery_date, workshop_notes, quote_items(id, position, title, variant_title, sku, customization, quantity, image_url, reference_image_path)",
    )
    .in("id", [...ids])
    .order("number");
  if (error) throw error;
  const imageUrls = await signedQuoteImageUrls(
    supabase,
    data.flatMap((q) => q.quote_items.map((i) => i.reference_image_path)),
  );
  return data.map((q) => ({
    id: q.id,
    code: q.code ?? "",
    status: quoteDisplayStatus(q.status, q.valid_until),
    clientName: q.client_name,
    issueDate: q.issue_date,
    deliveryDate: q.delivery_date,
    supplierDeliveryDate: q.supplier_delivery_date,
    notes: q.workshop_notes,
    lines: [...q.quote_items]
      .sort((a, b) => a.position - b.position)
      .map((i) => ({
        id: i.id,
        title: i.title,
        variantTitle: i.variant_title,
        sku: i.sku,
        customization: i.customization,
        quantity: i.quantity,
        image:
          (i.reference_image_path
            ? imageUrls.get(i.reference_image_path)
            : null) ??
          i.image_url ??
          null,
      })),
  }));
}

/** URLs firmadas (1 h) de las fotos referenciales, por ruta. */
async function signedQuoteImageUrls(
  supabase: Awaited<ReturnType<typeof createClient>>,
  paths: (string | null)[],
): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter((p): p is string => Boolean(p)))];
  if (unique.length === 0) return new Map();
  const { data, error } = await supabase.storage
    .from(QUOTE_IMAGES_BUCKET)
    .createSignedUrls(unique, 60 * 60);
  // Sin la URL la línea se muestra sin foto; no se rompe la página.
  if (error || !data) return new Map();
  return new Map(
    data.flatMap((d) => (d.path && d.signedUrl ? [[d.path, d.signedUrl]] : [])),
  );
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

function toQuoteIssuer(row: Tables<"quote_issuers">): QuoteIssuer {
  return {
    id: row.id,
    name: row.name,
    legalName: row.legal_name,
    documentType: row.document_type as QuoteIssuerDocumentType,
    documentNumber: row.document_number,
    bankName: row.bank_name,
    accountLabel: row.account_label,
    accountNumber: row.account_number,
    cci: row.cci,
    active: row.active,
  };
}

/** Sucursales de cotización, las activas primero; `onlyActive` para el selector. */
export async function listQuoteIssuers({ onlyActive = false } = {}): Promise<
  QuoteIssuer[]
> {
  const supabase = await createClient();
  let query = supabase
    .from("quote_issuers")
    .select("*")
    .order("active", { ascending: false })
    .order("name");
  if (onlyActive) query = query.eq("active", true);
  const { data, error } = await query;
  if (error) throw error;
  return data.map(toQuoteIssuer);
}

export type QuotePaymentRecord = {
  id: string;
  amountCents: Cents;
  methodName: string;
  paidOn: string;
  invoiceNumber: string | null;
  createdByName: string | null;
  createdAt: string;
};

export type QuotePayments = {
  payments: QuotePaymentRecord[];
  paidCents: Cents;
  balanceCents: Cents;
  status: PaymentStatus;
};

/** Pagos de la cotización (solo admin y ventas: la BD no devuelve nada a los demás). */
export async function listQuotePayments(
  quoteId: string,
  totalCents: Cents,
): Promise<QuotePayments> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quote_payments")
    .select(
      "id, amount, method_name, paid_on, invoice_number, created_by_name, created_at",
    )
    .eq("quote_id", quoteId)
    .order("paid_on")
    .order("created_at");
  if (error) throw error;
  const payments = data.map((p) => ({
    id: p.id,
    amountCents: toCents(Number(p.amount)),
    methodName: p.method_name,
    paidOn: p.paid_on,
    invoiceNumber: p.invoice_number,
    createdByName: p.created_by_name,
    createdAt: p.created_at,
  }));
  const paidCents = payments.reduce((sum, p) => sum + p.amountCents, 0);
  return {
    payments,
    paidCents,
    balanceCents: quoteBalance(totalCents, paidCents),
    status: quotePaymentStatus(totalCents, paidCents),
  };
}

/** Talleres activos (para asignar el de una cotización); el actual se ofrece aunque esté inactivo. */
export async function listWorkshopOptions(
  currentId: string | null = null,
): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workshops")
    .select("id, name, active")
    .order("name");
  if (error) throw error;
  return data
    .filter((w) => w.active || w.id === currentId)
    .map((w) => ({ id: w.id, name: w.name }));
}

// --- Seguimiento (logística): cotizaciones aprobadas sin dinero ni teléfonos ---

export type TrackingQuoteItem = {
  id: string;
  code: string;
  status: QuoteStatus;
  clientName: string;
  deliveryDate: string | null;
  supplierDeliveryDate: string | null;
  workLocation: QuoteWorkLocation | null;
  workshopId: string | null;
  workshopName: string | null;
  itemsCount: number;
};

export type TrackingQuotesPage = {
  quotes: TrackingQuoteItem[];
  total: number;
  pages: number;
};

/** Cotizaciones aceptadas y facturadas (RPC `list_logistics_quotes`). */
export async function listTrackingQuotes(
  filters: TrackingFilters,
  { limit = TRACKING_PAGE_SIZE }: { limit?: number } = {},
): Promise<TrackingQuotesPage> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_logistics_quotes", {
    p_query: filters.q || undefined,
    p_status: filters.status ?? undefined,
    p_workshop_id:
      filters.workshop && filters.workshop !== NO_WORKSHOP
        ? filters.workshop
        : undefined,
    p_without_workshop: filters.workshop === NO_WORKSHOP,
    p_location: filters.location ?? undefined,
    p_limit: limit,
    p_offset: (filters.page - 1) * limit,
  });
  if (error) throw error;
  const total = Number(data[0]?.total_count ?? 0);
  return {
    total,
    pages: Math.max(1, Math.ceil(total / limit)),
    quotes: data.map((q) => ({
      id: q.id,
      code: q.code ?? "",
      status: q.status,
      clientName: q.client_name,
      deliveryDate: q.delivery_date,
      supplierDeliveryDate: q.supplier_delivery_date,
      workLocation: q.work_location,
      workshopId: q.workshop_id,
      workshopName: q.workshop_name,
      itemsCount: q.items_count,
    })),
  };
}

type TrackingQuoteRow = {
  id: string;
  code: string | null;
  status: QuoteStatus;
  client_name: string;
  issue_date: string | null;
  delivery_date: string | null;
  supplier_delivery_date: string | null;
  workshop_notes: string;
  work_location: QuoteWorkLocation | null;
  workshop_id: string | null;
  workshop_name: string | null;
  lines: {
    id: string;
    title: string;
    variant_title: string;
    sku: string | null;
    customization: string;
    quantity: number;
    image_url: string | null;
    reference_image_path: string | null;
  }[];
};

export type TrackingQuoteDetail = {
  id: string;
  code: string;
  status: QuoteStatus;
  clientName: string;
  issueDate: string | null;
  deliveryDate: string | null;
  supplierDeliveryDate: string | null;
  workshopNotes: string;
  workLocation: QuoteWorkLocation | null;
  workshopId: string | null;
  workshopName: string | null;
  lines: WorkshopQuote["lines"];
};

/** Una cotización aprobada con sus productos y sin precios (RPC `get_logistics_quote`). */
export async function getTrackingQuote(
  id: string,
): Promise<TrackingQuoteDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_logistics_quote", {
    p_id: id,
  });
  if (error) throw error;
  if (!data) return null;
  const q = data as unknown as TrackingQuoteRow;
  const imageUrls = await signedQuoteImageUrls(
    supabase,
    q.lines.map((l) => l.reference_image_path),
  );
  return {
    id: q.id,
    code: q.code ?? "",
    status: q.status,
    clientName: q.client_name,
    issueDate: q.issue_date,
    deliveryDate: q.delivery_date,
    supplierDeliveryDate: q.supplier_delivery_date,
    workshopNotes: q.workshop_notes,
    workLocation: q.work_location,
    workshopId: q.workshop_id,
    workshopName: q.workshop_name,
    lines: q.lines.map((l) => ({
      id: l.id,
      title: l.title,
      variantTitle: l.variant_title,
      sku: l.sku,
      customization: l.customization,
      quantity: l.quantity,
      image:
        (l.reference_image_path
          ? imageUrls.get(l.reference_image_path)
          : null) ??
        l.image_url ??
        null,
    })),
  };
}

/** La orden para taller de cotizaciones aprobadas, por el RPC de logística. */
export async function listTrackingWorkshopQuotes(
  ids: readonly string[],
): Promise<WorkshopQuote[]> {
  const found = await Promise.all(ids.map((id) => getTrackingQuote(id)));
  return found
    .filter((q): q is TrackingQuoteDetail => q !== null)
    .map((q) => ({
      id: q.id,
      code: q.code,
      status: q.status,
      clientName: q.clientName,
      issueDate: q.issueDate,
      deliveryDate: q.deliveryDate,
      supplierDeliveryDate: q.supplierDeliveryDate,
      notes: q.workshopNotes,
      lines: q.lines,
    }));
}
