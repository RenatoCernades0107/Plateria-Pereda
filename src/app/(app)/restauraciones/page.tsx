import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Restauraciones" };

export default function RestauracionesPage() {
  return (
    <PageHeader title="Restauraciones" description="Módulo en construcción." />
  );
}
