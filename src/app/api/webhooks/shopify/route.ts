import { after, NextResponse, type NextRequest } from "next/server";

import { serverEnv } from "@/lib/env.server";
import { logger } from "@/lib/logger";
import { readBodyWithLimit } from "@/server/shopify-webhooks/body";
import {
  expectedShopDomain,
  webhookSecret,
} from "@/server/shopify-webhooks/config";
import { receiveWebhook } from "@/server/shopify-webhooks/receive";
import { shopifyWebhookHandlers } from "@/server/shopify-webhooks/registry";
import { processWebhookEvent } from "@/server/shopify-webhooks/router";
import { supabaseWebhookStore } from "@/server/shopify-webhooks/store";

/**
 * Webhooks de Shopify: verifica la firma con el body crudo, guarda el evento una sola
 * vez y responde 200 enseguida (Shopify reintenta si tarda más de 5 s). El evento se
 * procesa después de responder. Un cuerpo de más de 1 MB se rechaza sin leerlo entero.
 */
export async function POST(request: NextRequest) {
  const rawBody = await readBodyWithLimit(request);
  if (rawBody === null) {
    return NextResponse.json(
      { error: "Cuerpo demasiado grande" },
      { status: 413 },
    );
  }
  const env = serverEnv();
  const result = await receiveWebhook({
    headers: request.headers,
    rawBody,
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
        await processWebhookEvent(
          supabaseWebhookStore,
          eventId,
          shopifyWebhookHandlers,
        );
      } catch (error) {
        logger.error("No se pudo procesar el webhook de Shopify", {
          error,
          eventId,
        });
      }
    });
  }
  return NextResponse.json({ ok: true, duplicate: result.duplicate });
}
