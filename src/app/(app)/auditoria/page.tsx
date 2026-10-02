import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Auditoría" };

export default function AuditoriaPage() {
  return <PageHeader title="Auditoría" description="Módulo en construcción." />;
}
