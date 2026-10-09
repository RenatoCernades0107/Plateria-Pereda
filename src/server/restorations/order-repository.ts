import "server-only";

import { toCents } from "@/domain/money";
import { createAdminClient } from "@/lib/supabase/admin";

import type { RestorationOrderRepository } from "./shopify-order";

/** Restauraciones en Supabase con la clave secreta (lo usa el outbox, sin sesión). */
export const supabaseRestorationOrderRepository: RestorationOrderRepository = {
  async getOrderData(restorationId) {
    const admin = createAdminClient();
    const { data: r, error } = await admin
      .from("restorations")
      .select(
        "id, code, client_id, contact_id, prices_include_igv, shopify_order_id, shopify_order_name, pieces(id, code, number, price, status, approved_at), clients(kind, shopify_customer_id, shopify_company_location_id)",
      )
      .eq("id", restorationId)
      .maybeSingle();
    if (error) throw error;
    if (!r || !r.clients) return null;

    // Contacto que pidió; en una empresa sin contacto elegido, el primero activo.
    let contact: { shopifyCustomerId: string | null } | null = null;
    if (r.clients.kind === "empresa") {
      let query = admin
        .from("contacts")
        .select("shopify_customer_id")
        .eq("client_id", r.client_id);
      query = r.contact_id
        ? query.eq("id", r.contact_id)
        : query.eq("active", true).order("created_at").order("id");
      const { data: found, error: contactError } = await query
        .limit(1)
        .maybeSingle();
      if (contactError) throw contactError;
      contact = found && { shopifyCustomerId: found.shopify_customer_id };
    }

    return {
      id: r.id,
      code: r.code,
      pricesIncludeIgv: r.prices_include_igv,
      shopifyOrderId: r.shopify_order_id,
      shopifyOrderName: r.shopify_order_name,
      pieces: r.pieces.map((p) => ({
        id: p.id,
        code: p.code,
        number: p.number,
        priceCents: toCents(Number(p.price)),
        status: p.status,
        approvedAt: p.approved_at,
      })),
      client: {
        kind: r.clients.kind,
        shopifyCustomerId: r.clients.shopify_customer_id,
        shopifyCompanyLocationId: r.clients.shopify_company_location_id,
      },
      contact,
    };
  },

  async saveOrder(restorationId, order, lineIds) {
    const admin = createAdminClient();
    // Solo si aún no tiene orden: dos procesadores no se pisan.
    const { error } = await admin
      .from("restorations")
      .update({ shopify_order_id: order.id, shopify_order_name: order.name })
      .eq("id", restorationId)
      .is("shopify_order_id", null);
    if (error) throw error;
    for (const [pieceId, lineId] of Object.entries(lineIds)) {
      const { error: lineError } = await admin
        .from("pieces")
        .update({ shopify_line_item_id: lineId })
        .eq("id", pieceId);
      if (lineError) throw lineError;
    }
  },
};
