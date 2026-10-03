import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { requirePermission } from "@/server/auth";

export const metadata: Metadata = { title: "Usuarios" };

export default async function UsuariosPage() {
  await requirePermission("usuarios.gestionar");
  return <PageHeader title="Usuarios" description="Módulo en construcción." />;
}
