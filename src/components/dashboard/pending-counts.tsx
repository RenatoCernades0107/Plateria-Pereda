import { ArrowRight, ClipboardList, Gem } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { dashboardCounts, type DashboardCount } from "@/server/dashboard";
import { cn } from "@/lib/utils";

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
      <h3
        id={id}
        className="text-heading flex items-center gap-2 text-sm font-semibold [&>svg]:size-4"
      >
        {icon}
        {title}
      </h3>
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-5">
        {items.map((item) => (
          <CountCard key={item.key} item={item} />
        ))}
      </ul>
    </section>
  );
}

/** «Requiere atención»: pendientes de hoy con enlace al listado filtrado (S13). */
export async function PendingCounts({ showMoney }: { showMoney: boolean }) {
  const { pieces, restorations } = await dashboardCounts({ showMoney });
  return (
    <section
      aria-labelledby="requiere-atencion"
      className="space-y-5"
      data-testid="requiere-atencion"
    >
      <div>
        <h2
          id="requiere-atencion"
          className="text-heading text-lg font-semibold tracking-tight"
        >
          Requiere atención
        </h2>
        <p className="text-muted-foreground text-sm">
          Lo que hay pendiente hoy. Toca un número para ver la lista.
        </p>
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
    </section>
  );
}
