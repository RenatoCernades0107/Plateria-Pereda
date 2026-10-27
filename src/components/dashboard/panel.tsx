import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Tarjeta de un gráfico o tabla: título, subtítulo y (a la derecha) una acción. */
export function Panel({
  title,
  description,
  icon: Icon,
  action,
  children,
  className,
  testId,
}: {
  title: string;
  description?: ReactNode;
  icon?: LucideIcon;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <section
      aria-label={title}
      data-testid={testId}
      className={cn(
        "bg-card rounded-xl border p-4 shadow-xs sm:p-5",
        className,
      )}
    >
      <header className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <h3 className="text-heading flex items-center gap-2 font-semibold">
            {Icon ? <Icon aria-hidden className="text-primary size-4" /> : null}
            {title}
          </h3>
          {description ? (
            <p className="text-muted-foreground text-xs">{description}</p>
          ) : null}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

/** Mensaje compacto cuando un panel no tiene datos en el periodo. */
export function PanelEmpty({ children }: { children?: ReactNode }) {
  return (
    <p
      className="text-muted-foreground bg-muted/40 rounded-lg px-4 py-8 text-center text-sm"
      data-testid="panel-vacio"
    >
      {children ?? "Sin datos en este periodo."}
    </p>
  );
}

/** Rejilla de tarjetas KPI: dos columnas en el celular y hasta cuatro en pantallas anchas. */
export function KpiGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 xl:grid-cols-4">
      {children}
    </div>
  );
}
