import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { requirePermission } from "@/server/auth";

export const metadata: Metadata = { title: "Restauraciones" };

export default async function RestauracionesPage() {
  await requirePermission("restauraciones.ver");
  return (
    <PageHeader title="Restauraciones" description="Módulo en construcción." />
  );
}
