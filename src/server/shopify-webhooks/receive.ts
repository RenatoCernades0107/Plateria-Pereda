import type { Json } from "@/lib/supabase/database.types";

import { verifyWebhookHmac } from "./hmac";
import type { WebhookEventStore } from "./types";

export type ReceiveResult =
  | { status: 401 | 400; error: string }
  | { status: 200; eventId: number | null; duplicate: boolean };

/**
 * Valida y guarda un webhook. No lo procesa: la ruta responde 200 enseguida y lo
 * procesa después con `after()`.
 */
export async function receiveWebhook({
  headers,
  rawBody,
  secret,
  shopDomain,
  store,
}: {
  headers: Headers;
  rawBody: string;
  secret: string | null;
  shopDomain: string | null;
  store: WebhookEventStore;
}): Promise<ReceiveResult> {
  if (
    !secret ||
    !verifyWebhookHmac(rawBody, headers.get("x-shopify-hmac-sha256"), secret)
  ) {
    return { status: 401, error: "Firma inválida" };
  }
  if (!shopDomain || headers.get("x-shopify-shop-domain") !== shopDomain) {
    return { status: 401, error: "Tienda no reconocida" };
  }
  const webhookId = headers.get("x-shopify-webhook-id");
  const topic = headers.get("x-shopify-topic");
  if (!webhookId || !topic) {
    return { status: 400, error: "Faltan cabeceras de Shopify" };
  }

  let payload: Json;
  try {
    payload = JSON.parse(rawBody) as Json;
  } catch {
    return { status: 400, error: "El cuerpo no es JSON" };
  }
  if (payload === null || typeof payload !== "object") {
    return { status: 400, error: "El cuerpo no es un objeto JSON" };
  }

  const eventId = await store.insert({
    webhookId,
    topic,
    shopDomain,
    apiVersion: headers.get("x-shopify-api-version"),
    payload,
  });
  return { status: 200, eventId, duplicate: eventId === null };
}
