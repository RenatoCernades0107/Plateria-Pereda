import type { Json } from "@/lib/supabase/database.types";
import type { ShopifyGateway } from "@/server/shopify/gateway";

import type { SyncJob } from "./jobs";

/** Envía un job a Shopify; lo que devuelve se guarda en `result` (p. ej., el id creado). */
export type ShopifyJobHandler = (
  job: SyncJob,
  gateway: ShopifyGateway,
) => Promise<Json | void>;

/**
 * Handlers por tipo de job. Cada módulo agrega los suyos (clientes en 6.2, órdenes en
 * 9.1, pagos en 11.2…).
 */
export const shopifyJobHandlers: Record<string, ShopifyJobHandler> = {};
