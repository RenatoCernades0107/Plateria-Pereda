import type { Json } from "@/lib/supabase/database.types";

export type WebhookEvent = {
  id: number;
  webhookId: string;
  topic: string;
  shopDomain: string;
  payload: NonNullable<Json>;
};

export type NewWebhookEvent = Omit<WebhookEvent, "id"> & {
  apiVersion: string | null;
};

/** Persistencia de los webhooks (tabla `shopify_webhook_events`). */
export interface WebhookEventStore {
  /** Guarda el evento; null si ya existía (reenvío del mismo webhook). */
  insert(event: NewWebhookEvent): Promise<number | null>;
  /** Lo marca "processing" si estaba por procesar; null si otro ya lo tomó. */
  claim(id: number): Promise<WebhookEvent | null>;
  finish(
    id: number,
    status: "processed" | "ignored" | "error",
    error?: string,
  ): Promise<void>;
}

export type WebhookHandler = (event: WebhookEvent) => Promise<void>;
