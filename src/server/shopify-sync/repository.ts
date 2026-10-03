import "server-only";

import type { Json } from "@/lib/supabase/database.types";
import { createAdminClient } from "@/lib/supabase/admin";

import type { JobRepository, SyncJob } from "./jobs";

/** Outbox en Supabase, con la clave secreta (los usuarios no pueden tocarlo). */
export const supabaseJobRepository: JobRepository = {
  async claim(limit) {
    const { data, error } = await createAdminClient().rpc(
      "claim_shopify_jobs",
      {
        p_limit: limit,
      },
    );
    if (error) throw error;
    return data.map((row): SyncJob => ({
      id: row.id,
      kind: row.kind,
      entityTable: row.entity_table,
      entityId: row.entity_id,
      payload: row.payload,
      attempts: row.attempts,
      maxAttempts: row.max_attempts,
    }));
  },
  async complete(id, result: Json | null) {
    const { error } = await createAdminClient()
      .from("shopify_sync_jobs")
      .update({
        status: "ok",
        result,
        last_error: null,
        locked_at: null,
        completed_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) throw error;
  },
  async fail(id, message, retryAt) {
    const { error } = await createAdminClient()
      .from("shopify_sync_jobs")
      .update({
        status: retryAt ? "pending" : "error",
        last_error: message.slice(0, 2000),
        locked_at: null,
        ...(retryAt && { next_attempt_at: retryAt.toISOString() }),
      })
      .eq("id", id);
    if (error) throw error;
  },
};

/** Vuelve a poner un job en cola ahora, con intentos nuevos (botón "Reintentar"). */
export async function requeueJob(id: number) {
  const { data, error } = await createAdminClient()
    .from("shopify_sync_jobs")
    .update({
      status: "pending",
      attempts: 0,
      next_attempt_at: new Date().toISOString(),
      locked_at: null,
    })
    .eq("id", id)
    .in("status", ["error", "pending"])
    .select("id");
  if (error) throw error;
  return data.length > 0;
}
