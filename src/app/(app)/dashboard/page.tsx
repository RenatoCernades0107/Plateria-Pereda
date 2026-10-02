import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return <PageHeader title="Dashboard" description="Módulo en construcción." />;
}
