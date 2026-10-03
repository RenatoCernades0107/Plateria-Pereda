import type {
  NewWebhookEvent,
  WebhookEvent,
  WebhookEventStore,
} from "@/server/shopify-webhooks/types";

type Row = WebhookEvent & { status: string; error?: string };

/** Store en memoria con las mismas reglas que la tabla (para tests). */
export function memoryWebhookStore() {
  const rows: Row[] = [];
  const store: WebhookEventStore = {
    async insert(event: NewWebhookEvent) {
      if (rows.some((r) => r.webhookId === event.webhookId)) return null;
      const id = rows.length + 1;
      rows.push({ id, ...event, status: "received" });
      return id;
    },
    async claim(id) {
      const row = rows.find((r) => r.id === id);
      if (!row || !["received", "error"].includes(row.status)) return null;
      row.status = "processing";
      return row;
    },
    async finish(id, status, error) {
      const row = rows.find((r) => r.id === id)!;
      row.status = status;
      row.error = error;
    },
  };
  return { store, rows };
}
