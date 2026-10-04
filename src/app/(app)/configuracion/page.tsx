import type { Metadata } from "next";

import { LogoUploader } from "@/components/settings/logo-uploader";
import { SettingsForm } from "@/components/settings/settings-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requirePermission } from "@/server/auth";
import { getSettings } from "@/server/settings";

export const metadata: Metadata = { title: "Configuración" };

export default async function ConfiguracionPage() {
  await requirePermission("configuracion.gestionar");
  const settings = await getSettings();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Logo</CardTitle>
          <CardDescription>Se guarda apenas lo eliges.</CardDescription>
        </CardHeader>
        <CardContent>
          <LogoUploader logoUrl={settings.logoUrl} />
        </CardContent>
      </Card>
      <SettingsForm
        defaultValues={{
          legalName: settings.legalName,
          ruc: settings.ruc ?? "",
          address: settings.address,
          phones: settings.phones,
          email: settings.email,
          quoteValidityDays: settings.quoteValidityDays,
          depositPercent: settings.depositPercent,
          whatsappTemplate: settings.whatsappTemplate,
          terms: settings.terms,
        }}
      />
    </div>
  );
}
