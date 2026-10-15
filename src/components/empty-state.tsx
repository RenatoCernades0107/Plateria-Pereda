import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Lista o sección sin registros: el porqué y, si hay, una sola acción para salir del
 * vacío (p. ej. "Limpiar filtros" o "Nueva restauración").
 */
export function EmptyState({
  children,
  action,
  className,
}: {
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "text-muted-foreground flex flex-col items-center gap-3 rounded-md border p-6 text-center text-sm",
        className,
      )}
    >
      <p>{children}</p>
      {action ? <div className="flex flex-wrap gap-2">{action}</div> : null}
    </div>
  );
}
