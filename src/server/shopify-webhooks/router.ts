import type { WebhookEventStore, WebhookHandler } from "./types";

/**
 * Handlers por topic de Shopify (p. ej. "orders/updated"). Se agregan en cada módulo:
 * pagos hechos en Shopify en 11.3, cambios de cliente en 6.x.
 */
export const webhookHandlers: Record<string, WebhookHandler> = {};

export type ProcessOutcome = "processed" | "ignored" | "error" | "skipped";

/** Procesa un webhook guardado una sola vez, aunque se llame varias veces. */
export async function processWebhookEvent(
  store: WebhookEventStore,
  id: number,
  handlers: Record<string, WebhookHandler> = webhookHandlers,
): Promise<ProcessOutcome> {
  const event = await store.claim(id);
  if (!event) return "skipped";

  const handler = handlers[event.topic];
  if (!handler) {
    await store.finish(id, "ignored");
    return "ignored";
  }
  try {
    await handler(event);
    await store.finish(id, "processed");
    return "processed";
  } catch (error) {
    await store.finish(
      id,
      "error",
      error instanceof Error ? error.message : String(error),
    );
    return "error";
  }
}
