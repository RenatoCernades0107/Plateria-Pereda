import "server-only";

import { parseMoney } from "@/domain/money";
import { createAdminClient } from "@/lib/supabase/admin";

import type { OrderContext, OrderSyncRepository } from "./shopify-order-sync";

/** Cliente de Shopify a nombre de quien va la orden (persona, o contacto de la empresa). */
async function orderCustomer(
  clientId: string,
  contactId: string | null,
): Promise<
  Pick<OrderContext, "customerId" | "companyLocationId" | "customerPending">
> {
  const db = createAdminClient();
  const { data: client, error } = await db
    .from("clients")
    .select("kind, shopify_customer_id, shopify_company_location_id")
    .eq("id", clientId)
    .single();
  if (error) throw error;
  if (client.kind === "persona") {
    return {
      customerId: client.shopify_customer_id,
      companyLocationId: null,
      customerPending: !client.shopify_customer_id,
    };
  }
  // Empresa (P14): la orden va a nombre del contacto de la restauración o, si no
  // tiene, del primer contacto activo de la empresa.
  const query = db
    .from("contacts")
    .select("id, shopify_customer_id")
    .eq("client_id", clientId)
    .eq("active", true)
    .order("created_at");
  const { data: contacts, error: contactsError } = await query;
  if (contactsError) throw contactsError;
  const contact =
    contacts.find((c) => c.id === contactId) ??
    contacts.find((c) => c.shopify_customer_id) ??
    contacts[0];
  return {
    customerId: contact?.shopify_customer_id ?? null,
    companyLocationId: client.shopify_company_location_id,
    customerPending:
      !client.shopify_company_location_id ||
      (Boolean(contact) && !contact?.shopify_customer_id),
  };
}

export const supabaseOrderSyncRepository: OrderSyncRepository = {
  async getOrderContext(restorationId) {
    const db = createAdminClient();
    const { data, error } = await db
      .from("restorations")
      .select(
        "id, code, client_id, contact_id, shopify_order_id, pieces (id, code, price, status, approved_at, number)",
      )
      .eq("id", restorationId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      id: data.id,
      code: data.code,
      shopifyOrderId: data.shopify_order_id,
      ...(await orderCustomer(data.client_id, data.contact_id)),
      pieces: [...data.pieces]
        .sort((a, b) => a.number - b.number)
        .map((p) => ({
          id: p.id,
          code: p.code,
          priceCents: parseMoney(String(p.price)) ?? 0,
          status: p.status,
          approved: p.approved_at !== null,
        })),
    };
  },

  async saveOrder(restorationId, order) {
    const { error } = await createAdminClient()
      .from("restorations")
      .update({ shopify_order_id: order.id, shopify_order_name: order.name })
      .eq("id", restorationId);
    if (error) throw error;
  },

  async saveLineIds(lines) {
    const db = createAdminClient();
    // Solo se escriben los que cambiaron (cada escritura queda en la auditoría).
    for (const { pieceId, lineId } of lines) {
      const update = db
        .from("pieces")
        .update({ shopify_line_item_id: lineId })
        .eq("id", pieceId);
      const { error } = await (lineId
        ? update.or(
            `shopify_line_item_id.is.null,shopify_line_item_id.neq."${lineId}"`,
          )
        : update.not("shopify_line_item_id", "is", null));
      if (error) throw error;
    }
  },
};
