import type { Json } from "@/lib/supabase/database.types";
import type { ShopifyGateway } from "@/server/shopify/gateway";

import type { SyncJob } from "./jobs";

/** Envía un job a Shopify; lo que devuelve se guarda en `result` (p. ej., el id creado). */
export type ShopifyJobHandler = (
  job: SyncJob,
  gateway: ShopifyGateway,
) => Promise<Json | void>;
