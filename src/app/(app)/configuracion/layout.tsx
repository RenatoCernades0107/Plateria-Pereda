import { PageHeader } from "@/components/page-header";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { requirePermission } from "@/server/auth";

export default async function ConfiguracionLayout({
  children,
}: LayoutProps<"/configuracion">) {
  await requirePermission("configuracion.gestionar");
  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <PageHeader
          title="Configuración"
          description="Datos de la empresa, valores por defecto y catálogos del sistema."
        />
        <SettingsTabs />
      </div>
      {children}
    </div>
  );
}
