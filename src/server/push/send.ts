import "server-only";

import webpush from "web-push";

import {
  renderAlert,
  toAlertCounts,
  type AlertKind,
  type AlertPiece,
} from "@/domain/alerts";
import { isExpiredSubscription, pushPayload } from "@/domain/push";
import { serverEnv } from "@/lib/env.server";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export type PushSummary = { alerts: number; sent: number; expired: number };

/** Claves VAPID; null si las notificaciones push no están configuradas. */
export function vapidDetails() {
  const env = serverEnv();
  if (
    !env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
    !env.VAPID_PRIVATE_KEY ||
    !env.VAPID_SUBJECT
  ) {
    return null;
  }
  return {
    subject: env.VAPID_SUBJECT,
    publicKey: env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
  };
}

/**
 * Envía por push las alertas pendientes (las de la última hora sin enviar) a todos los
 * dispositivos de cada destinatario. Las suscripciones vencidas se borran.
 */
export async function dispatchPendingPushes(): Promise<PushSummary> {
  const summary: PushSummary = { alerts: 0, sent: 0, expired: 0 };
  const vapid = vapidDetails();
  if (!vapid) return summary;

  const supabase = createAdminClient();
  const { data: alerts, error } = await supabase.rpc(
    "claim_push_notifications",
    { p_limit: 100 },
  );
  if (error) throw error;
  if (!alerts?.length) return summary;
  summary.alerts = alerts.length;

  const recipients = [...new Set(alerts.map((a) => a.recipient_id))];
  const [subscriptions, settings] = await Promise.all([
    supabase
      .from("push_subscriptions")
      .select("id, user_id, endpoint, p256dh, auth")
      .in("user_id", recipients),
    supabase.from("alert_settings").select("id, template"),
  ]);
  if (subscriptions.error) throw subscriptions.error;
  const templates = new Map(
    (settings.data ?? []).map((s) => [s.id, s.template]),
  );

  const expired = new Set<string>();
  await Promise.all(
    alerts.flatMap((alert) => {
      const message = renderAlert(
        {
          kind: alert.kind as AlertKind,
          restorationCode: alert.restoration_code,
          clientName: alert.client_name,
          actorName: alert.actor_name,
          counts: toAlertCounts(alert.data),
          pieces: (alert.pieces ?? []) as AlertPiece[],
        },
        templates.get(alert.kind),
      );
      const payload = JSON.stringify(
        pushPayload({
          kind: alert.kind,
          restorationId: alert.restoration_id,
          ...message,
        }),
      );
      return subscriptions.data
        .filter((s) => s.user_id === alert.recipient_id)
        .map(async (s) => {
          try {
            await webpush.sendNotification(
              {
                endpoint: s.endpoint,
                keys: { p256dh: s.p256dh, auth: s.auth },
              },
              payload,
              { vapidDetails: vapid, TTL: 60 * 60 * 24, urgency: "high" },
            );
            summary.sent++;
          } catch (error) {
            const statusCode = (error as { statusCode?: number }).statusCode;
            if (isExpiredSubscription(statusCode)) {
              expired.add(s.id);
            } else {
              logger.warn("No se pudo enviar una notificación push", {
                statusCode,
                notificationId: alert.id,
              });
            }
          }
        });
    }),
  );

  if (expired.size > 0) {
    summary.expired = expired.size;
    await supabase
      .from("push_subscriptions")
      .delete()
      .in("id", [...expired]);
  }
  return summary;
}
