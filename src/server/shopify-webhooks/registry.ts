import "server-only";

import { applyShopifyCustomerChange } from "@/server/clients/repository";
import { clientWebhookHandlers } from "@/server/clients/webhooks";
import { supabaseOrderWebhookRepository } from "@/server/restorations/order-repository";
import { orderWebhookHandlers } from "@/server/restorations/payment-webhooks";
import { runShopifySync } from "@/server/shopify-sync/run";

import type { WebhookHandler } from "./types";

/**
 * Handlers por topic de Shopify (p. ej. "customers/update"), con sus dependencias
 * reales. Los de la orden traen los pagos hechos en Shopify (11.3).
 */
export const shopifyWebhookHandlers: Record<string, WebhookHandler> = {
  ...clientWebhookHandlers(applyShopifyCustomerChange),
  ...orderWebhookHandlers(supabaseOrderWebhookRepository, () =>
    runShopifySync(),
  ),
};
