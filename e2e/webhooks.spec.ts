import { randomUUID } from "node:crypto";

import {
  FAKE_SHOP_DOMAIN,
  FAKE_WEBHOOK_SECRET,
} from "../src/server/shopify-webhooks/config";
import { signWebhook } from "../src/server/shopify-webhooks/hmac";
import { expect, test } from "./fixtures";
import { adminClient } from "./support/supabase";

const body = JSON.stringify({ id: 9001, email: "ana.perez@correo.pe" });

function headers(
  webhookId: string,
  hmac = signWebhook(body, FAKE_WEBHOOK_SECRET),
) {
  return {
    "Content-Type": "application/json",
    "X-Shopify-Topic": "customers/update",
    "X-Shopify-Shop-Domain": FAKE_SHOP_DOMAIN,
    "X-Shopify-Webhook-Id": webhookId,
    "X-Shopify-Hmac-Sha256": hmac,
  };
}

test.describe("Webhooks de Shopify", () => {
  test("una firma inválida responde 401 y no guarda el evento", async ({
    request,
  }) => {
    const webhookId = `e2e-${randomUUID()}`;
    const response = await request.post("/api/webhooks/shopify", {
      data: body,
      headers: headers(webhookId, "firma-falsa"),
    });
    expect(response.status()).toBe(401);
    const { data } = await adminClient()
      .from("shopify_webhook_events")
      .select("id")
      .eq("webhook_id", webhookId);
    expect(data).toEqual([]);
  });

  test("una firma válida responde 200 y guarda el evento una vez", async ({
    request,
  }) => {
    const webhookId = `e2e-${randomUUID()}`;
    try {
      for (const duplicate of [false, true]) {
        const response = await request.post("/api/webhooks/shopify", {
          data: body,
          headers: headers(webhookId),
        });
        expect(response.status()).toBe(200);
        expect(await response.json()).toEqual({ ok: true, duplicate });
      }
      await expect
        .poll(async () => {
          const { data } = await adminClient()
            .from("shopify_webhook_events")
            .select("topic, status, payload")
            .eq("webhook_id", webhookId);
          return data;
        })
        .toEqual([
          {
            topic: "customers/update",
            // Aún no hay handler para este topic (llega en la Fase 6).
            status: "ignored",
            payload: { id: 9001, email: "ana.perez@correo.pe" },
          },
        ]);
    } finally {
      await adminClient()
        .from("shopify_webhook_events")
        .delete()
        .eq("webhook_id", webhookId);
    }
  });

  test("el endpoint de cron rechaza peticiones sin el secreto", async ({
    request,
  }) => {
    const response = await request.get("/api/cron/shopify-sync");
    expect(response.status()).toBe(401);
  });
});
