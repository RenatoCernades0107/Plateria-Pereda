import "server-only";

import { serverEnv } from "@/lib/env.server";
import { supabaseClientSyncRepository } from "@/server/clients/repository";
import { clientJobHandlers } from "@/server/clients/shopify-sync";
import { supabaseRestorationOrderRepository } from "@/server/restorations/order-repository";
import { restorationOrderHandlers } from "@/server/restorations/shopify-order";

import type { ShopifyJobHandler } from "./handlers";

/** Handlers de cada tipo de job del outbox, con sus dependencias reales. */
export const shopifyJobHandlers: Record<string, ShopifyJobHandler> = {
  ...clientJobHandlers(supabaseClientSyncRepository),
  ...restorationOrderHandlers(
    supabaseRestorationOrderRepository,
    () => serverEnv().APP_URL,
  ),
};
