import type { WebhookEventStore, WebhookHandler } from "./types";

export type ProcessOutcome = "processed" | "ignored" | "error" | "skipped";

/** Procesa un webhook guardado una sola vez, aunque se llame varias veces. */
export async function processWebhookEvent(
  store: WebhookEventStore,
  id: number,
  handlers: Record<string, WebhookHandler>,
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
