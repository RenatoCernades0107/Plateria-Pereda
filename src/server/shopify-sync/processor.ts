import type { ShopifyGateway } from "@/server/shopify/gateway";
import { ShopifyError } from "@/server/shopify/errors";

import type { ShopifyJobHandler } from "./handlers";
import { jobBackoffMs, type JobRepository } from "./jobs";

export type ProcessSummary = {
  processed: number;
  ok: number;
  retrying: number;
  failed: number;
};

type Options = {
  repo: JobRepository;
  gateway: ShopifyGateway;
  handlers: Record<string, ShopifyJobHandler>;
  batchSize?: number;
  now?: () => Date;
};

/**
 * Procesa los jobs vencidos del outbox. Es idempotente por diseño: cada handler debe
 * poder repetirse sin duplicar (p. ej., buscar la orden por etiqueta antes de crearla).
 * Los errores que se pueden reintentar esperan con backoff hasta `maxAttempts`; los
 * demás (datos rechazados, credenciales) quedan en error de inmediato.
 */
export async function processShopifyJobs({
  repo,
  gateway,
  handlers,
  batchSize = 10,
  now = () => new Date(),
}: Options): Promise<ProcessSummary> {
  const summary: ProcessSummary = {
    processed: 0,
    ok: 0,
    retrying: 0,
    failed: 0,
  };
  const jobs = await repo.claim(batchSize);

  for (const job of jobs) {
    summary.processed += 1;
    const handler = handlers[job.kind];
    if (!handler) {
      await repo.fail(job.id, `Tipo de job desconocido: ${job.kind}`, null);
      summary.failed += 1;
      continue;
    }
    try {
      const result = await handler(job, gateway);
      await repo.complete(job.id, result ?? null);
      summary.ok += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Un error que no es de Shopify (red, base de datos) también se reintenta.
      const retryable = error instanceof ShopifyError ? error.retryable : true;
      if (retryable && job.attempts < job.maxAttempts) {
        const retryAt = new Date(now().getTime() + jobBackoffMs(job.attempts));
        await repo.fail(job.id, message, retryAt);
        summary.retrying += 1;
      } else {
        await repo.fail(job.id, message, null);
        summary.failed += 1;
      }
    }
  }
  return summary;
}
