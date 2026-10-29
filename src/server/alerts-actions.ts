"use server";

import { revalidatePath } from "next/cache";

import {
  ALERT_ROLES,
  DEFAULT_ALERT_TEMPLATES,
  renderAlert,
  toAlertCounts,
  type AlertKind,
  type AlertPiece,
} from "@/domain/alerts";
import { createClient } from "@/lib/supabase/server";
import { INVALID_ARGS, idsArg, validArgs } from "@/lib/validation/action-args";
import {
  alertSettingsSchema,
  type AlertSettingsInput,
} from "@/lib/validation/alerts";
import { listAlertRecipients } from "@/server/alerts";
import { requirePermission, requireUser } from "@/server/auth";

export type MyAlert = {
  id: string;
  kind: AlertKind;
  title: string;
  body: string;
  href: string;
  createdAt: string;
  read: boolean;
};

export type MyAlerts = { alerts: MyAlert[]; unread: number };

/** Últimas alertas del usuario (para la campana), con el mensaje ya armado. */
export async function getMyAlerts(): Promise<MyAlerts> {
  await requireUser();
  const supabase = await createClient();
  const [notifications, settings] = await Promise.all([
    supabase.rpc("my_notifications", { p_limit: 20 }),
    supabase.from("alert_settings").select("id, template"),
  ]);
  if (notifications.error) throw notifications.error;
  const templates = new Map(
    (settings.data ?? []).map((s) => [s.id, s.template]),
  );

  const rows = notifications.data ?? [];
  return {
    unread: Number(rows[0]?.unread_count ?? 0),
    alerts: rows.map((n) => ({
      id: n.id,
      kind: n.kind,
      ...renderAlert(
        {
          kind: n.kind,
          restorationCode: n.restoration_code,
          clientName: n.client_name,
          actorName: n.actor_name,
          counts: toAlertCounts(n.data),
          pieces: (n.pieces ?? []) as AlertPiece[],
        },
        templates.get(n.kind),
      ),
      href: `/restauraciones/${n.restoration_id}`,
      createdAt: n.created_at,
      read: n.read_at !== null,
    })),
  };
}

export type AlertActionResult = { ok: true } | { error: string };

/** Marca como leídas las alertas indicadas, o todas las del usuario. */
export async function markAlertsRead(
  ids?: string[],
): Promise<AlertActionResult> {
  const user = await requireUser();
  if (!validArgs([idsArg.optional()], [ids])) return { error: INVALID_ARGS };
  const supabase = await createClient();
  let query = supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", user.id)
    .is("read_at", null);
  if (ids) {
    if (ids.length === 0) return { ok: true };
    query = query.in("id", ids);
  }
  const { error } = await query;
  if (error) return { error: "No se pudieron marcar las alertas." };
  return { ok: true };
}

/** Guarda la configuración de las alertas (solo admin). */
export async function updateAlertSettings(
  input: AlertSettingsInput,
): Promise<AlertActionResult> {
  await requirePermission("configuracion.gestionar");
  const parsed = alertSettingsSchema.safeParse(input);
  if (!parsed.success) return { error: "Revisa los mensajes de las alertas." };

  const recipients = await listAlertRecipients();
  const supabase = await createClient();
  for (const alert of parsed.data.alerts) {
    // Se guardan los que NO la reciben: un usuario nuevo la recibe por defecto.
    const chosen = new Set(alert.recipientIds);
    const muted = recipients
      .filter(
        (r) => ALERT_ROLES[alert.kind].includes(r.role) && !chosen.has(r.id),
      )
      .map((r) => r.id);
    const template = alert.template.trim();
    const { error } = await supabase
      .from("alert_settings")
      .update({
        enabled: alert.enabled,
        // Igual al de la aplicación o vacío: null, para seguir sus mejoras.
        template:
          template === "" || template === DEFAULT_ALERT_TEMPLATES[alert.kind]
            ? null
            : template,
        muted_user_ids: muted,
      })
      .eq("id", alert.kind);
    if (error) return { error: "No se pudo guardar la configuración." };
  }

  revalidatePath("/configuracion/alertas");
  return { ok: true };
}
