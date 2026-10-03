import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { requirePermission } from "@/server/auth";

export const metadata: Metadata = { title: "Auditoría" };

export default async function AuditoriaPage() {
  await requirePermission("auditoria.ver");
  return <PageHeader title="Auditoría" description="Módulo en construcción." />;
}
