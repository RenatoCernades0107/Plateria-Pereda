import { NextResponse, type NextRequest } from "next/server";

import { serverEnv } from "@/lib/env.server";
import { safeEqual } from "@/server/secrets";
import { runShopifySync } from "@/server/shopify-sync/run";

/**
 * Reintentos del outbox de Shopify. Lo llama Vercel Cron cada 5 minutos en producción
 * (Paso 16.2) y `pnpm shopify:sync` en local, con `Authorization: Bearer CRON_SECRET`.
 */
export const maxDuration = 60;

const MAX_BATCHES = 5;

export async function GET(request: NextRequest) {
  const secret = serverEnv().CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(header, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const total = { processed: 0, ok: 0, retrying: 0, failed: 0 };
  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const summary = await runShopifySync();
    for (const key of Object.keys(total) as (keyof typeof total)[]) {
      total[key] += summary[key];
    }
    if (summary.processed === 0) break;
  }
  return NextResponse.json(total);
}
