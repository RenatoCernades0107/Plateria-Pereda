import { ArrowRight, ClipboardList, Gem, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { can } from "@/domain/permissions";
import { cn } from "@/lib/utils";
import { requirePermission } from "@/server/auth";
import { dashboardCounts, type DashboardCount } from "@/server/dashboard";

export const metadata: Metadata = { title: "Dashboard" };

/** Un pendiente: el número grande y el enlace al listado con ese filtro. */
function CountCard({ item }: { item: DashboardCount }) {
  const zero = item.count === 0;
  return (
    <li>
      <Link
        href={item.href}
        className={cn(
          "group bg-card hover:border-primary/60 flex h-full flex-col justify-between gap-2 rounded-lg border p-4 transition-colors",
          zero && "text-muted-foreground",
        )}
        data-testid={`pendiente-${item.key}`}
      >
        <span className="text-sm font-medium">{item.label}</span>
        <span className="flex items-end justify-between gap-2">
          <span
            className={cn(
              "text-3xl font-semibold tabular-nums",
              !zero && "text-heading",
            )}
          >
            {item.count}
          </span>
          <ArrowRight
            aria-hidden
            className="text-muted-foreground size-4 transition-transform group-hover:translate-x-0.5"
          />
        </span>
      </Link>
    </li>
  );
}

function CountGroup({
  id,
  title,
  icon,
  items,
}: {
  id: string;
  title: string;
  icon: ReactNode;
  items: DashboardCount[];
}) {
  return (
    <section aria-labelledby={id} className="space-y-3">
      <h2
        id={id}
        className="text-heading flex items-center gap-2 font-semibold [&>svg]:size-4"
      >
        {icon}
        {title}
      </h2>
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-5">
        {items.map((item) => (
          <CountCard key={item.key} item={item} />
        ))}
      </ul>
    </section>
  );
}

export default async function DashboardPage() {
  const user = await requirePermission("dashboard.ver");
  const canEdit = can(user.role, "restauraciones.editar");
  const { pieces, restorations } = await dashboardCounts({
    showMoney: canEdit,
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title="Dashboard"
          description="Lo que hay pendiente hoy. Toca un número para ver la lista."
        />
        {canEdit ? (
          <Button asChild>
            <Link href="/restauraciones/nueva">
              <Plus />
              Nueva restauración
            </Link>
          </Button>
        ) : null}
      </div>
      <CountGroup
        id="pendientes-piezas"
        title="Piezas"
        icon={<Gem aria-hidden className="text-primary" />}
        items={pieces}
      />
      <CountGroup
        id="pendientes-restauraciones"
        title="Restauraciones"
        icon={<ClipboardList aria-hidden className="text-primary" />}
        items={restorations}
      />
    </div>
  );
}
