import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Usuarios" };

export default function UsuariosPage() {
  return <PageHeader title="Usuarios" description="Módulo en construcción." />;
}
