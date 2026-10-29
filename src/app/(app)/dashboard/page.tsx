import { Download, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { ClientsArea } from "@/components/dashboard/areas/clients-area";
import { OrdersArea } from "@/components/dashboard/areas/orders-area";
import { QuotesArea } from "@/components/dashboard/areas/quotes-area";
import { SalesArea } from "@/components/dashboard/areas/sales-area";
import { SellersArea } from "@/components/dashboard/areas/sellers-area";
import { SummaryArea } from "@/components/dashboard/areas/summary-area";
import { WorkshopsArea } from "@/components/dashboard/areas/workshops-area";
import { AreaSkeleton } from "@/components/dashboard/area-skeleton";
import {
  DashboardShell,
  type AreaTab,
} from "@/components/dashboard/dashboard-shell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  DASHBOARD_AREAS,
  DASHBOARD_AREA_LABELS,
  formatRange,
  parseDashboardParams,
  previousRange,
} from "@/domain/dashboard-range";
import { can } from "@/domain/permissions";
import { limaDateOf } from "@/domain/quote";
import { requirePermission } from "@/server/auth";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({
  searchParams,
}: PageProps<"/dashboard">) {
  const user = await requirePermission("dashboard.ver");
  const canEdit = can(user.role, "restauraciones.editar");
  // Costos, márgenes y el ranking de todos los vendedores: solo el admin (D78).
  const canMargins = can(user.role, "dashboard.margenes");
  const { area, range } = parseDashboardParams(await searchParams);
  const today = limaDateOf(new Date());

  const tabs: AreaTab[] = DASHBOARD_AREAS.map((key) => ({
    key,
    label:
      key === "vendedores" && !canMargins
        ? "Mi desempeño"
        : DASHBOARD_AREA_LABELS[key],
  }));
  const exportParams = new URLSearchParams({
    area,
    desde: range.from,
    hasta: range.to,
  });

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title="Dashboard"
          description="Cómo va el negocio: ventas, pedidos, clientes, talleres y cotizaciones."
        />
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <a
              href={`/api/dashboard/exportar?${exportParams.toString()}`}
              data-testid="exportar-csv"
            >
              <Download />
              Exportar CSV
            </a>
          </Button>
          {canEdit ? (
            <Button asChild>
              <Link href="/restauraciones/nueva">
                <Plus />
                Nueva restauración
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <DashboardShell
        area={area}
        range={range}
        today={today}
        tabs={tabs}
        rangeText={formatRange(range)}
        previousText={formatRange(previousRange(range))}
      >
        <Suspense fallback={<AreaSkeleton />}>
          {area === "resumen" ? (
            <SummaryArea range={range} canMargins={canMargins} />
          ) : null}
          {area === "ventas" ? (
            <SalesArea range={range} canMargins={canMargins} />
          ) : null}
          {area === "pedidos" ? <OrdersArea range={range} /> : null}
          {area === "clientes" ? <ClientsArea range={range} /> : null}
          {area === "talleres" ? (
            <WorkshopsArea range={range} canMargins={canMargins} />
          ) : null}
          {area === "vendedores" ? <SellersArea range={range} /> : null}
          {area === "cotizaciones" ? <QuotesArea range={range} /> : null}
        </Suspense>
      </DashboardShell>
    </div>
  );
}
