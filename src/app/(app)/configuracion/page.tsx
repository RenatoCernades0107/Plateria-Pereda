import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { requirePermission } from "@/server/auth";

export const metadata: Metadata = { title: "Configuración" };

export default async function ConfiguracionPage() {
  await requirePermission("configuracion.gestionar");
  return (
    <PageHeader title="Configuración" description="Módulo en construcción." />
  );
}
