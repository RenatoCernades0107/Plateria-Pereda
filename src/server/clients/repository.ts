import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import type { ClientSyncRepository } from "./shopify-sync";
import {
  IMPORT_OUTCOMES,
  type ImportCustomer,
  type ImportOutcome,
} from "./shopify-import";
import type { ShopifyCustomerChange } from "./webhooks";

/** Clientes en Supabase con la clave secreta (lo usa el outbox, sin sesión de usuario). */
export const supabaseClientSyncRepository: ClientSyncRepository = {
  async getClient(id) {
    const { data, error } = await createAdminClient()
      .from("clients")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return (
      data && {
        id: data.id,
        kind: data.kind,
        firstName: data.first_name,
        lastName: data.last_name,
        legalName: data.legal_name,
        documentNumber: data.document_number,
        phone: data.phone,
        email: data.email,
        address: data.address,
        city: data.city,
        region: data.region,
        shopifyCustomerId: data.shopify_customer_id,
        shopifyCompanyId: data.shopify_company_id,
        shopifyCompanyLocationId: data.shopify_company_location_id,
      }
    );
  },
  async setClientShopifyIds(id, ids) {
    const { error } = await createAdminClient()
      .from("clients")
      .update({
        ...(ids.shopifyCustomerId !== undefined && {
          shopify_customer_id: ids.shopifyCustomerId,
        }),
        ...(ids.shopifyCompanyId !== undefined && {
          shopify_company_id: ids.shopifyCompanyId,
        }),
        ...(ids.shopifyCompanyLocationId !== undefined && {
          shopify_company_location_id: ids.shopifyCompanyLocationId,
        }),
      })
      .eq("id", id);
    if (error) throw error;
  },
  async getContact(id) {
    const { data, error } = await createAdminClient()
      .from("contacts")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return (
      data && {
        id: data.id,
        clientId: data.client_id,
        firstName: data.first_name,
        lastName: data.last_name,
        phone: data.phone,
        email: data.email,
        shopifyCustomerId: data.shopify_customer_id,
        shopifyCompanyContactId: data.shopify_company_contact_id,
      }
    );
  },
  async setContactShopifyIds(id, ids) {
    const { error } = await createAdminClient()
      .from("contacts")
      .update({
        shopify_customer_id: ids.shopifyCustomerId,
        shopify_company_contact_id: ids.shopifyCompanyContactId,
      })
      .eq("id", id);
    if (error) throw error;
  },
};

/** Aplica un cambio hecho en Shopify sin volver a encolarlo (ver la migración). */
export async function applyShopifyCustomerChange(
  change: ShopifyCustomerChange,
): Promise<number> {
  const { data, error } = await createAdminClient().rpc(
    "apply_shopify_customer_update",
    {
      p_customer_id: change.customerId,
      p_first_name: change.firstName ?? "",
      p_last_name: change.lastName ?? "",
      p_email: change.email ?? "",
      p_phone: change.phone ?? "",
    },
  );
  if (error) throw error;
  return data;
}

/** Guarda un cliente importado de Shopify (idempotente, ver la migración). */
export const importCustomerWithAdmin: ImportCustomer = async (input) => {
  const { data, error } = await createAdminClient().rpc(
    "import_shopify_customer",
    {
      p_customer_id: input.customerId,
      p_first_name: input.firstName,
      p_last_name: input.lastName,
      p_email: input.email ?? "",
      p_phone: input.phone ?? "",
      p_note: input.note,
      p_fallback_name: input.fallbackName,
    },
  );
  if (error) throw new Error(error.message);
  if (!(IMPORT_OUTCOMES as readonly string[]).includes(data)) {
    throw new Error(`Resultado inesperado de la importación: ${data}`);
  }
  return data as ImportOutcome;
};
