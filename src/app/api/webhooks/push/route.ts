import { NextResponse, type NextRequest } from "next/server";

import { serverEnv } from "@/lib/env.server";
import { dispatchPendingPushes } from "@/server/push/send";
import { safeEqual } from "@/server/secrets";

/**
 * Envía por push las alertas nuevas. Lo llama la BD (pg_net) apenas se crean, con
 * `Authorization: Bearer CRON_SECRET` (secreto `push_dispatch_secret` de Vault).
 */
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const secret = serverEnv().CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(header, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  return NextResponse.json(await dispatchPendingPushes());
}
