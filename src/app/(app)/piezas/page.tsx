import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { requirePermission } from "@/server/auth";

export const metadata: Metadata = { title: "Piezas" };

export default async function PiezasPage() {
  await requirePermission("restauraciones.ver");
  return <PageHeader title="Piezas" description="Módulo en construcción." />;
}
