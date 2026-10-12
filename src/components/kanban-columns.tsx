import { cn } from "@/lib/utils";

export type KanbanColumn<T> = {
  /** Estado de la columna (va en `data-testid="columna-<key>"`). */
  key: string;
  label: string;
  items: readonly T[];
};

/**
 * Columnas de un tablero kanban (piezas o restauraciones por estado). En el celular
 * se desplazan en horizontal dentro de su contenedor, sin mover la página. Cada
 * columna es un elemento de la lista con su título y el número de tarjetas.
 */
export function KanbanColumns<T>({
  columns,
  label,
  emptyText,
  renderCard,
}: {
  columns: readonly KanbanColumn<T>[];
  /** Nombre accesible de la lista de columnas (p. ej. "Piezas por estado"). */
  label: string;
  /** Texto de una columna vacía. */
  emptyText: string;
  renderCard: (item: T) => React.ReactNode;
}) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
      <div className="flex gap-3" role="list" aria-label={label}>
        {columns.map((column) => (
          <section
            key={column.key}
            role="listitem"
            aria-label={column.label}
            className="bg-muted/40 flex w-72 shrink-0 flex-col gap-2 rounded-lg border p-2"
            data-testid={`columna-${column.key}`}
          >
            <h2 className="flex items-center justify-between px-1 text-sm font-semibold">
              {column.label}
              <span className="text-muted-foreground font-normal">
                {column.items.length}
              </span>
            </h2>
            {column.items.length === 0 ? (
              <p className="text-muted-foreground px-1 py-4 text-center text-xs">
                {emptyText}
              </p>
            ) : (
              column.items.map(renderCard)
            )}
          </section>
        ))}
      </div>
    </div>
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
