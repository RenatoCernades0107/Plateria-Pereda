import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { requirePermission } from "@/server/auth";

export const metadata: Metadata = { title: "Cotizaciones" };

export default async function CotizacionesPage() {
  await requirePermission("cotizador.usar");
  return (
    <PageHeader title="Cotizaciones" description="Módulo en construcción." />
  );
}
