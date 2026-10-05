import { Columns3, Table2 } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

/** Cambia entre la tabla y el tablero kanban por estado (queda en la URL). */
export function ViewToggle({
  view,
  tableHref,
  kanbanHref,
}: {
  view: "tabla" | "kanban";
  tableHref: string;
  kanbanHref: string;
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
        "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium",
        view === value
          ? "bg-background text-foreground shadow-sm"
          : "text-foreground/80 hover:text-foreground",
      )}
    >
      <Icon className="size-4" aria-hidden />
      {label}
    </Link>
  );
  return (
    <nav aria-label="Vista" className="bg-muted inline-flex rounded-lg p-1">
      {option("tabla", tableHref, "Tabla", Table2)}
      {option("kanban", kanbanHref, "Kanban", Columns3)}
    </nav>
  );
}
