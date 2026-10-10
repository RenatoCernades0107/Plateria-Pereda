import "server-only";

import { serverEnv } from "@/lib/env.server";
import { supabaseClientSyncRepository } from "@/server/clients/repository";
import { clientJobHandlers } from "@/server/clients/shopify-sync";
import { supabaseOrderSyncRepository } from "@/server/restorations/order-sync-repository";
import { orderJobHandlers } from "@/server/restorations/shopify-order-sync";

import type { ShopifyJobHandler } from "./handlers";

/** Handlers de cada tipo de job del outbox, con sus dependencias reales. */
export const shopifyJobHandlers: Record<string, ShopifyJobHandler> = {
  ...clientJobHandlers(supabaseClientSyncRepository),
  ...orderJobHandlers(supabaseOrderSyncRepository, () => serverEnv().APP_URL),
};
