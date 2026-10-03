import { after, NextResponse, type NextRequest } from "next/server";

import { serverEnv } from "@/lib/env.server";
import {
  expectedShopDomain,
  webhookSecret,
} from "@/server/shopify-webhooks/config";
import { receiveWebhook } from "@/server/shopify-webhooks/receive";
import { processWebhookEvent } from "@/server/shopify-webhooks/router";
import { supabaseWebhookStore } from "@/server/shopify-webhooks/store";

/**
 * Webhooks de Shopify: verifica la firma con el body crudo, guarda el evento una sola
 * vez y responde 200 enseguida (Shopify reintenta si tarda más de 5 s). El evento se
 * procesa después de responder.
 */
export async function POST(request: NextRequest) {
  const env = serverEnv();
  const result = await receiveWebhook({
    headers: request.headers,
    rawBody: await request.text(),
    secret: webhookSecret(env),
    shopDomain: expectedShopDomain(env),
    store: supabaseWebhookStore,
  });

  if (result.status !== 200) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  }
  if (result.eventId !== null) {
    const eventId = result.eventId;
    after(async () => {
      try {
        await processWebhookEvent(supabaseWebhookStore, eventId);
      } catch (error) {
        console.error("No se pudo procesar el webhook de Shopify", error);
      }
    });
  }
  return NextResponse.json({ ok: true, duplicate: result.duplicate });
}
