import { afterAll, describe, expect, it, vi } from "vitest";

import { createAdminClient } from "@/lib/supabase/admin";

import { signWebhook } from "./hmac";
import { receiveWebhook } from "./receive";
import { processWebhookEvent } from "./router";
import { supabaseWebhookStore } from "./store";

const SECRET = "secreto-int";
const SHOP = "pereda-int.myshopify.com";
const WEBHOOK_ID = `int-${Date.now()}`;

describe("webhooks de Shopify en la base de datos", () => {
  afterAll(async () => {
    await createAdminClient()
      .from("shopify_webhook_events")
      .delete()
      .eq("webhook_id", WEBHOOK_ID);
  });

  it("el mismo webhook enviado dos veces se procesa una sola vez", async () => {
    const body = JSON.stringify({ id: 77, financial_status: "paid" });
    const headers = new Headers({
      "x-shopify-hmac-sha256": signWebhook(body, SECRET),
      "x-shopify-shop-domain": SHOP,
      "x-shopify-webhook-id": WEBHOOK_ID,
      "x-shopify-topic": "orders/updated",
    });
    const receive = () =>
      receiveWebhook({
        headers,
        rawBody: body,
        secret: SECRET,
        shopDomain: SHOP,
        store: supabaseWebhookStore,
      });

    const first = await receive();
    const second = await receive();
    expect(first).toMatchObject({ status: 200, duplicate: false });
    expect(second).toEqual({ status: 200, eventId: null, duplicate: true });

    // Aunque dos procesadores lo tomen a la vez, el handler corre una vez.
    const handler = vi.fn(async () => {});
    const eventId = (first as { eventId: number }).eventId;
    const outcomes = await Promise.all([
      processWebhookEvent(supabaseWebhookStore, eventId, {
        "orders/updated": handler,
      }),
      processWebhookEvent(supabaseWebhookStore, eventId, {
        "orders/updated": handler,
      }),
    ]);
    expect(outcomes.sort()).toEqual(["processed", "skipped"]);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: { id: 77, financial_status: "paid" },
      }),
    );

    const { data } = await createAdminClient()
      .from("shopify_webhook_events")
      .select("status, processed_at")
      .eq("webhook_id", WEBHOOK_ID);
    expect(data).toHaveLength(1);
    expect(data![0]!.status).toBe("processed");
  });
});
