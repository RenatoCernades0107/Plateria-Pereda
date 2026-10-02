import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Piezas" };

export default function PiezasPage() {
  return <PageHeader title="Piezas" description="Módulo en construcción." />;
}
