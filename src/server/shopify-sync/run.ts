import "server-only";

import { after } from "next/server";

import { getShopifyGateway } from "@/server/shopify";

import { processShopifyJobs } from "./processor";
import { shopifyJobHandlers } from "./registry";
import { supabaseJobRepository } from "./repository";

/** Procesa una tanda de jobs del outbox con las dependencias reales. */
export function runShopifySync(batchSize = 10) {
  return processShopifyJobs({
    repo: supabaseJobRepository,
    gateway: getShopifyGateway(),
    handlers: shopifyJobHandlers,
    batchSize,
  });
}

/**
 * Procesa el outbox apenas termina la respuesta al usuario, para que el cambio llegue a
 * Shopify en segundos. Si falla, el cron lo reintenta cada 5 minutos.
 */
export function scheduleShopifySync() {
  after(async () => {
    try {
      await runShopifySync();
    } catch (error) {
      console.error("No se pudo procesar el outbox de Shopify", error);
    }
  });
}
