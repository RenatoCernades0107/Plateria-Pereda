import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Cotizaciones" };

export default function CotizacionesPage() {
  return (
    <PageHeader title="Cotizaciones" description="Módulo en construcción." />
  );
}
