import { cn } from "@/lib/utils";

/**
 * Piezas de presentación del kanban, compartidas por las columnas fijas y las que
 * aceptan arrastrar (`kanban-drag.tsx`).
 */

/** Lista de columnas: en el celular se desplaza en horizontal sin mover la página. */
export function KanbanList({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
      <div className="flex gap-3" role="list" aria-label={label}>
        {children}
      </div>
    </div>
  );
}

/** Una columna: título con el número de tarjetas y el texto si está vacía. */
export function KanbanColumnFrame({
  columnKey,
  label,
  count,
  emptyText,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"section">, "children"> & {
  columnKey: string;
  label: string;
  count: number;
  emptyText: string;
  children: React.ReactNode;
}) {
  return (
    <section
      role="listitem"
      aria-label={label}
      className={cn(
        "bg-muted/40 flex shrink-0 flex-col gap-2 rounded-lg border p-2 transition-[opacity,background-color,box-shadow,width]",
        // Las columnas vacías se angostan: el tablero cabe mejor en la pantalla.
        count === 0 ? "w-44" : "w-72",
        className,
      )}
      data-testid={`columna-${columnKey}`}
      {...props}
    >
      <h2 className="flex items-center justify-between px-1 text-sm font-semibold">
        {label}
        <span className="text-muted-foreground font-normal">{count}</span>
      </h2>
      {count === 0 ? (
        <p className="text-muted-foreground px-1 py-4 text-center text-xs">
          {emptyText}
        </p>
      ) : (
        children
      )}
    </section>
  );
}

/** Tarjeta de una columna del kanban. */
export function KanbanCard({
  className,
  ...props
}: React.ComponentProps<"article">) {
  return (
    <article
      className={cn(
        "bg-background space-y-1.5 rounded-md border p-3 text-sm shadow-xs",
        className,
      )}
      {...props}
    />
  );
}
