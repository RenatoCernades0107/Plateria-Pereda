import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { requirePermission } from "@/server/auth";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  await requirePermission("dashboard.ver");
  return <PageHeader title="Dashboard" description="Módulo en construcción." />;
}
