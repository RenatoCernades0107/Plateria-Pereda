import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { requirePermission } from "@/server/auth";

export const metadata: Metadata = { title: "Clientes" };

export default async function ClientesPage() {
  await requirePermission("clientes.ver");
  return <PageHeader title="Clientes" description="Módulo en construcción." />;
}
