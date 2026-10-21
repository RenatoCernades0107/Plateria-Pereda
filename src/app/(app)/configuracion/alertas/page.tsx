import type { Metadata } from "next";

import { AlertsForm } from "@/components/settings/alerts-form";
import { ALERT_ROLES } from "@/domain/alerts";
import { getAlertSettings, listAlertRecipients } from "@/server/alerts";
import { requirePermission } from "@/server/auth";

export const metadata: Metadata = { title: "Alertas" };

export default async function AlertasPage() {
  await requirePermission("configuracion.gestionar");
  const [settings, recipients] = await Promise.all([
    getAlertSettings(),
    listAlertRecipients(),
  ]);

  return (
    <AlertsForm
      recipients={recipients}
      defaultValues={{
        alerts: settings.map((s) => ({
          kind: s.kind,
          enabled: s.enabled,
          template: s.template,
          recipientIds: recipients
            .filter(
              (r) =>
                ALERT_ROLES[s.kind].includes(r.role) &&
                !s.mutedUserIds.includes(r.id),
            )
            .map((r) => r.id),
        })),
      }}
    />
  );
}
