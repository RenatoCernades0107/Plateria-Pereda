"use server";

import { pushSubscriptionSchema } from "@/domain/push";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { INVALID_ARGS, validArgs } from "@/lib/validation/action-args";
import { requireUser } from "@/server/auth";

export type PushActionResult = { ok: true } | { error: string };

/**
 * Guarda el dispositivo del usuario para recibir las alertas por push. Con la clave
 * secreta: si el navegador era de otro usuario (cambió la sesión), pasa a este.
 */
export async function savePushSubscription(
  subscription: unknown,
  userAgent?: string,
): Promise<PushActionResult> {
  const user = await requireUser();
  const parsed = pushSubscriptionSchema.safeParse(subscription);
  if (!parsed.success) return { error: INVALID_ARGS };
  const { error } = await createAdminClient()
    .from("push_subscriptions")
    .upsert(
      {
        user_id: user.id,
        endpoint: parsed.data.endpoint,
        p256dh: parsed.data.keys.p256dh,
        auth: parsed.data.keys.auth,
        user_agent: userAgent?.slice(0, 500) ?? null,
      },
      { onConflict: "endpoint" },
    );
  if (error) return { error: "No se pudieron activar las notificaciones." };
  return { ok: true };
}

/** Deja de enviar alertas a este dispositivo. */
export async function removePushSubscription(
  endpoint: string,
): Promise<PushActionResult> {
  const user = await requireUser();
  if (!validArgs([pushSubscriptionSchema.shape.endpoint], [endpoint])) {
    return { error: INVALID_ARGS };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("user_id", user.id)
    .eq("endpoint", endpoint);
  if (error) return { error: "No se pudieron desactivar las notificaciones." };
  return { ok: true };
}
