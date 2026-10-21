import "server-only";

import {
  ALERT_KINDS,
  ALERT_ROLES,
  DEFAULT_ALERT_TEMPLATES,
  type AlertKind,
} from "@/domain/alerts";
import type { AppRole } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

export type AlertSetting = {
  kind: AlertKind;
  enabled: boolean;
  /** Mensaje guardado; null si se usa el de la aplicación. */
  customTemplate: string | null;
  /** Mensaje que se aplica (el guardado o el de la aplicación). */
  template: string;
  mutedUserIds: string[];
};

/** Configuración de las alertas, en el orden de ALERT_KINDS. */
export async function getAlertSettings(): Promise<AlertSetting[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("alert_settings")
    .select("id, enabled, template, muted_user_ids");
  if (error) throw error;
  return ALERT_KINDS.map((kind) => {
    const row = data.find((r) => r.id === kind);
    return {
      kind,
      enabled: row?.enabled ?? true,
      customTemplate: row?.template ?? null,
      template: row?.template ?? DEFAULT_ALERT_TEMPLATES[kind],
      mutedUserIds: row?.muted_user_ids ?? [],
    };
  });
}

export type AlertRecipient = { id: string; fullName: string; role: AppRole };

const ALERT_RECIPIENT_ROLES = [
  ...new Set(Object.values(ALERT_ROLES).flat()),
] as AppRole[];

/** Usuarios activos que pueden recibir alguna alerta (solo admin los lista). */
export async function listAlertRecipients(): Promise<AlertRecipient[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .eq("active", true)
    .in("role", ALERT_RECIPIENT_ROLES)
    .order("full_name");
  if (error) throw error;
  return data.map((p) => ({ id: p.id, fullName: p.full_name, role: p.role }));
}
