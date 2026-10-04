import type { Json } from "@/lib/supabase/database.types";

export type SyncJobStatus = "pending" | "processing" | "ok" | "error";

export type SyncJob = {
  id: number;
  kind: string;
  entityTable: string;
  entityId: string;
  payload: Json;
  attempts: number;
  maxAttempts: number;
};

/** Acceso a `shopify_sync_jobs` (con la clave secreta en producción). */
export interface JobRepository {
  /** Toma jobs vencidos con FOR UPDATE SKIP LOCKED y les suma un intento. */
  claim(limit: number): Promise<SyncJob[]>;
  complete(id: number, result: Json | null): Promise<void>;
  /** `retryAt` null = sin más reintentos (queda en error). */
  fail(id: number, error: string, retryAt: Date | null): Promise<void>;
}

/** Espera antes del siguiente intento: 30 s, 1 min, 2 min… con tope de 1 hora. */
export function jobBackoffMs(attempts: number): number {
  return Math.min(30_000 * 2 ** (Math.max(attempts, 1) - 1), 60 * 60 * 1000);
}
