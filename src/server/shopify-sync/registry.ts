import "server-only";

import { supabaseClientSyncRepository } from "@/server/clients/repository";
import { clientJobHandlers } from "@/server/clients/shopify-sync";

import type { ShopifyJobHandler } from "./handlers";

/** Handlers de cada tipo de job del outbox, con sus dependencias reales. */
export const shopifyJobHandlers: Record<string, ShopifyJobHandler> = {
  ...clientJobHandlers(supabaseClientSyncRepository),
};
