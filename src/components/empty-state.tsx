import { Inbox, RotateCcw, SearchX, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Lista o sección sin registros: un icono, el porqué y, si hay, una sola acción para
 * salir del vacío (p. ej. "Restablecer filtros" o "Nueva restauración"). Con `title`
 * se muestra grande (listados); sin él, compacto (secciones de un detalle).
 * `filtered`: el vacío se debe a los filtros (icono de lupa).
 */
export function EmptyState({
  children,
  title,
  action,
  icon,
  filtered = false,
  className,
}: {
  children?: ReactNode;
  title?: ReactNode;
  action?: ReactNode;
  icon?: LucideIcon;
  filtered?: boolean;
  className?: string;
}) {
  const Icon = icon ?? (filtered ? SearchX : Inbox);
  return (
    <div
      data-testid="estado-vacio"
      className={cn(
        "text-muted-foreground flex flex-col items-center gap-3 rounded-lg border border-dashed text-center text-sm",
        title ? "px-6 py-12" : "p-6",
        className,
      )}
    >
      {title ? (
        <span className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
          <Icon className="size-6" aria-hidden />
        </span>
      ) : null}
      <div className="space-y-1">
        {title ? (
          <p className="text-heading text-base font-medium">{title}</p>
        ) : null}
        {children ? <p className="max-w-md">{children}</p> : null}
      </div>
      {action ? <div className="flex flex-wrap gap-2">{action}</div> : null}
    </div>
  );
}

/**
 * Vacío porque los filtros no encontraron nada: el mismo mensaje en todos los
 * listados y el botón principal para volver a ver todo.
 */
export function FilteredEmptyState({
  resetHref,
  className,
}: {
  /** La vista sin filtros (conserva la vista tabla o kanban). */
  resetHref: string;
  className?: string;
}) {
  return (
    <EmptyState
      filtered
      title="No encontramos resultados para tu búsqueda."
      className={className}
      action={
        <Button asChild>
          <Link href={resetHref}>
            <RotateCcw aria-hidden />
            Restablecer filtros
          </Link>
        </Button>
      }
    >
      Prueba con otras palabras o quita algunos filtros.
    </EmptyState>
  );
}
