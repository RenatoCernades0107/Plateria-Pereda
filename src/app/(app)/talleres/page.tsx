import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { requirePermission } from "@/server/auth";

export const metadata: Metadata = { title: "Talleres" };

export default async function TalleresPage() {
  await requirePermission("talleres.gestionar");
  return <PageHeader title="Talleres" description="Módulo en construcción." />;
}
