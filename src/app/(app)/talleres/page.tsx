import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Talleres" };

export default function TalleresPage() {
  return <PageHeader title="Talleres" description="Módulo en construcción." />;
}
