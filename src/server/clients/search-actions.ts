"use server";

import {
  mergeClientOptions,
  parseClientQuery,
  type ClientOption,
} from "@/domain/client-search";
import { personFromShopify } from "@/domain/shopify-customer";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/server/auth";
import { getShopifyGateway } from "@/server/shopify";

export type ClientSearchResult = {
  options: ClientOption[];
  /** Shopify no respondió: se muestran solo los resultados del sistema. */
  shopifyUnavailable: boolean;
};

const LIMIT = 10;

/**
 * Busca en el sistema (clientes y contactos activos) y en Shopify (clientes que aún no
 * están en el sistema) por nombre, documento, teléfono o email.
 */
export async function searchClients(
  query: string,
): Promise<ClientSearchResult> {
  await requirePermission("clientes.ver");
  const { text, digits, searchable } = parseClientQuery(query);
  if (!searchable) return { options: [], shopifyUnavailable: false };

  const like = `%${text}%`;
  const phoneFilter = digits.length >= 3 ? `,phone.ilike.%${digits}%` : "";
  const supabase = await createClient();

  const [clients, contacts, shopify] = await Promise.all([
    supabase
      .from("clients")
      .select(
        "id, kind, display_name, document_type, document_number, phone, email, shopify_customer_id",
      )
      .eq("active", true)
      .or(
        `display_name.ilike.${like},document_number.ilike.${like},email.ilike.${like}${phoneFilter}`,
      )
      .order("display_name")
      .limit(LIMIT),
    supabase
      .from("contacts")
      .select(
        "id, client_id, display_name, phone, email, shopify_customer_id, client:clients(display_name)",
      )
      .eq("active", true)
      .or(`display_name.ilike.${like},email.ilike.${like}${phoneFilter}`)
      .order("display_name")
      .limit(LIMIT),
    getShopifyGateway()
      .searchCustomers(text, { first: LIMIT })
      .then((page) => page.items)
      .catch(() => null),
  ]);
  if (clients.error) throw clients.error;
  if (contacts.error) throw contacts.error;

  const local: ClientOption[] = [
    ...clients.data.map((c): ClientOption => ({
      source: "local",
      kind: c.kind,
      clientId: c.id,
      name: c.display_name ?? "",
      documentType: c.document_type,
      documentNumber: c.document_number,
      phone: c.phone,
      email: c.email,
      shopifyCustomerId: c.shopify_customer_id,
    })),
    ...contacts.data.map((k): ClientOption => ({
      source: "local",
      kind: "contacto",
      clientId: k.client_id,
      contactId: k.id,
      name: k.display_name ?? "",
      companyName: k.client?.display_name ?? "",
      phone: k.phone,
      email: k.email,
      shopifyCustomerId: k.shopify_customer_id,
    })),
  ];
  const remote: ClientOption[] = (shopify ?? []).map((c) => ({
    source: "shopify",
    kind: "persona",
    shopifyCustomerId: c.id,
    name: c.displayName,
    phone: c.phone,
    email: c.email,
  }));

  return {
    options: mergeClientOptions(local, remote),
    shopifyUnavailable: shopify === null,
  };
}

export type ImportResult =
  { ok: true; option: ClientOption } | { error: string };

/**
 * Guarda en el sistema un cliente que solo existe en Shopify (elegido en el buscador).
 * Es idempotente: si ya se importó, devuelve el existente.
 */
export async function importShopifyCustomer(
  shopifyCustomerId: string,
): Promise<ImportResult> {
  await requirePermission("clientes.editar");
  if (!shopifyCustomerId.startsWith("gid://shopify/Customer/")) {
    return { error: "Cliente de Shopify inválido." };
  }
  const supabase = await createClient();
  const select =
    "id, kind, display_name, document_type, document_number, phone, email, shopify_customer_id";

  const existing = await supabase
    .from("clients")
    .select(select)
    .eq("shopify_customer_id", shopifyCustomerId)
    .maybeSingle();
  if (existing.error) throw existing.error;

  let row = existing.data;
  if (!row) {
    const customer = await getShopifyGateway().getCustomer(shopifyCustomerId);
    if (!customer) return { error: "El cliente ya no existe en Shopify." };
    const person = personFromShopify(customer);
    const inserted = await supabase
      .from("clients")
      .insert({
        kind: "persona",
        first_name: person.firstName,
        last_name: person.lastName,
        phone: person.phone,
        email: person.email,
        notes: person.notes,
        shopify_customer_id: customer.id,
      })
      .select(select)
      .single();
    if (inserted.error)
      return { error: "No se pudo guardar el cliente de Shopify." };
    row = inserted.data;
  }

  return {
    ok: true,
    option: {
      source: "local",
      kind: "persona",
      clientId: row.id,
      name: row.display_name ?? "",
      documentType: row.document_type,
      documentNumber: row.document_number,
      phone: row.phone,
      email: row.email,
      shopifyCustomerId: row.shopify_customer_id,
    },
  };
}
