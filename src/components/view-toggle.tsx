import { Columns3, Table2 } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * Cambia entre la tabla (o lista) y el tablero kanban por estado (queda en la URL).
 * Conmutador segmentado: la vista activa va resaltada con el color principal, así se
 * ve de un vistazo cuál está abierta.
 */
export function ViewToggle({
  view,
  tableHref,
  kanbanHref,
  tableLabel = "Tabla",
}: {
  view: "tabla" | "kanban";
  tableHref: string;
  kanbanHref: string;
  /** Nombre de la vista no kanban (p. ej. "Lista" en el detalle). */
  tableLabel?: string;
}) {
  const option = (
    value: "tabla" | "kanban",
    href: string,
    label: string,
    Icon: typeof Table2,
  ) => (
    <Link
      href={href}
      aria-current={view === value ? "page" : undefined}
      className={cn(
        "focus-visible:ring-ring/50 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors outline-none focus-visible:ring-[3px] pointer-coarse:py-2",
        view === value
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-foreground/80 hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon className="size-4" aria-hidden />
      {label}
    </Link>
  );
  return (
    <nav
      aria-label="Vista"
      className="bg-background inline-flex shrink-0 gap-0.5 rounded-lg border p-0.5 shadow-xs"
    >
      {option("tabla", tableHref, tableLabel, Table2)}
      {option("kanban", kanbanHref, "Kanban", Columns3)}
    </nav>
  );
}
