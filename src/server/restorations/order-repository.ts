import "server-only";

import { toCents, toDecimalString } from "@/domain/money";
import type { SyncPayment } from "@/domain/payment-sync";
import { createAdminClient } from "@/lib/supabase/admin";

import type { OrderWebhookRepository } from "./payment-webhooks";
import type { RestorationOrderRepository } from "./shopify-order";

/** Restauraciones en Supabase con la clave secreta (lo usa el outbox, sin sesión). */
export const supabaseRestorationOrderRepository: RestorationOrderRepository = {
  async getOrderData(restorationId) {
    const admin = createAdminClient();
    const { data: r, error } = await admin
      .from("restorations")
      .select(
        "id, code, client_id, contact_id, prices_include_igv, shopify_order_id, shopify_order_name, pieces(id, code, number, price, status, approved_at), clients(kind, shopify_customer_id, shopify_company_location_id), payments(id, kind, amount, method_name, shopify_synced_at, created_at, payment_methods(shopify_name))",
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
        priceCents: p.price === null ? null : toCents(Number(p.price)),
        status: p.status,
        approvedAt: p.approved_at,
      })),
      client: {
        kind: r.clients.kind,
        shopifyCustomerId: r.clients.shopify_customer_id,
        shopifyCompanyLocationId: r.clients.shopify_company_location_id,
      },
      contact,
      payments: [...r.payments]
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((p): SyncPayment => ({
          id: p.id,
          kind: p.kind,
          amountCents: toCents(Number(p.amount)),
          // Nombre del método en la tienda (D34); si no lo tiene, el del sistema.
          gateway: p.payment_methods?.shopify_name || p.method_name,
          synced: p.shopify_synced_at !== null,
        })),
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

  async markPaymentsSynced(paymentIds) {
    const { error } = await createAdminClient()
      .from("payments")
      .update({ shopify_synced_at: new Date().toISOString() })
      .in("id", paymentIds)
      .is("shopify_synced_at", null);
    if (error) throw error;
  },

  async knownTransactions(restorationId) {
    const { data, error } = await createAdminClient()
      .from("shopify_order_transactions")
      .select("id")
      .eq("restoration_id", restorationId);
    if (error) throw error;
    return new Set(data.map((t) => t.id));
  },

  async rememberTransactions(restorationId, ids) {
    const { error } = await createAdminClient()
      .from("shopify_order_transactions")
      .upsert(
        ids.map((id) => ({
          id,
          restoration_id: restorationId,
          origin: "sistema" as const,
        })),
        { onConflict: "id", ignoreDuplicates: true },
      );
    if (error) throw error;
  },

  async importPayments(restorationId, payments) {
    const admin = createAdminClient();
    // Primero el pago (único por transacción) y luego la transacción como contada.
    const { error } = await admin.from("payments").upsert(
      payments.map((p) => ({
        restoration_id: restorationId,
        kind: p.kind,
        amount: Number(toDecimalString(p.amountCents)),
        method_name: p.methodName,
        paid_on: p.paidOn,
        reason: p.kind === "reembolso" ? "Reembolso hecho en Shopify" : "",
        source: "shopify" as const,
        shopify_transaction_id: p.transactionId,
      })),
      { onConflict: "shopify_transaction_id", ignoreDuplicates: true },
    );
    if (error) throw error;
    const { error: knownError } = await admin
      .from("shopify_order_transactions")
      .upsert(
        payments.map((p) => ({
          id: p.transactionId,
          restoration_id: restorationId,
          origin: "shopify" as const,
        })),
        { onConflict: "id", ignoreDuplicates: true },
      );
    if (knownError) throw knownError;
  },

  async saveLineIds(lines) {
    const admin = createAdminClient();
    // Solo se escriben los que cambiaron (cada escritura queda en la auditoría).
    for (const { pieceId, lineId } of lines) {
      const update = admin
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

/** Webhooks de la orden (11.3), con la clave secreta. */
export const supabaseOrderWebhookRepository: OrderWebhookRepository = {
  async findRestorationByOrder(orderId) {
    const { data, error } = await createAdminClient()
      .from("restorations")
      .select("id")
      .eq("shopify_order_id", orderId)
      .maybeSingle();
    if (error) throw error;
    return data?.id ?? null;
  },

  async enqueuePaymentSync(restorationId) {
    const { error } = await createAdminClient().rpc("enqueue_payment_sync", {
      p_restoration_id: restorationId,
    });
    if (error) throw error;
  },

  async applyOrderCustomer(restorationId, c) {
    const { data, error } = await createAdminClient().rpc(
      "apply_shopify_order_customer",
      {
        p_restoration_id: restorationId,
        p_customer_id: c.customerId,
        p_first_name: c.firstName ?? "",
        p_last_name: c.lastName ?? "",
        p_email: c.email ?? "",
        p_phone: c.phone ?? "",
      },
    );
    if (error) throw error;
    return data;
  },
};
