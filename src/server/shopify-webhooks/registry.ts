import "server-only";

import { applyShopifyCustomerChange } from "@/server/clients/repository";
import { clientWebhookHandlers } from "@/server/clients/webhooks";

import type { WebhookHandler } from "./types";

/**
 * Handlers por topic de Shopify (p. ej. "customers/update"), con sus dependencias
 * reales. Los pagos hechos en Shopify se agregan en 11.3.
 */
export const shopifyWebhookHandlers: Record<string, WebhookHandler> = {
  ...clientWebhookHandlers(applyShopifyCustomerChange),
};
