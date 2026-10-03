import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import type { WebhookEventStore } from "./types";

export const supabaseWebhookStore: WebhookEventStore = {
  async insert(event) {
    const { data, error } = await createAdminClient()
      .from("shopify_webhook_events")
      .upsert(
        {
          webhook_id: event.webhookId,
          topic: event.topic,
          shop_domain: event.shopDomain,
          api_version: event.apiVersion,
          payload: event.payload,
        },
        { onConflict: "webhook_id", ignoreDuplicates: true },
      )
      .select("id");
    if (error) throw error;
    return data[0]?.id ?? null;
  },
  async claim(id) {
    const { data, error } = await createAdminClient()
      .from("shopify_webhook_events")
      .update({ status: "processing" })
      .eq("id", id)
      .in("status", ["received", "error"])
      .select("id, webhook_id, topic, shop_domain, payload");
    if (error) throw error;
    const row = data[0];
    return row
      ? {
          id: row.id,
          webhookId: row.webhook_id,
          topic: row.topic,
          shopDomain: row.shop_domain,
          payload: row.payload,
        }
      : null;
  },
  async finish(id, status, message) {
    const { error } = await createAdminClient()
      .from("shopify_webhook_events")
      .update({
        status,
        error: message?.slice(0, 2000) ?? null,
        processed_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) throw error;
  },
};
