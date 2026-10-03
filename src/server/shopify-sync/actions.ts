"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/server/auth";

import { requeueJob } from "./repository";
import { scheduleShopifySync } from "./run";

export type RetryResult = { ok: true } | { error: string };

/** Botón "Reintentar" de SyncStatus: vuelve a encolar el job y lo procesa enseguida. */
export async function retryShopifyJob(
  jobId: number,
  pathToRevalidate?: string,
): Promise<RetryResult> {
  await requirePermission("restauraciones.editar");
  if (!Number.isInteger(jobId) || jobId <= 0) {
    return { error: "Sincronización inválida." };
  }
  if (!(await requeueJob(jobId))) {
    return { error: "Esta sincronización ya no se puede reintentar." };
  }
  scheduleShopifySync();
  if (pathToRevalidate?.startsWith("/")) revalidatePath(pathToRevalidate);
  return { ok: true };
}
