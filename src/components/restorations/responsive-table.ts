/**
 * Clases para que una tabla de piezas se vea como tarjetas en el celular: en pantallas
 * chicas las filas se apilan y cada celda lleva su etiqueta (`data-label`), así no hay
 * que desplazarse de lado para ver el estado o el taller. Desde `md` es una tabla.
 */
export const RT = {
  wrapper: "relative rounded-lg border md:overflow-x-auto",
  table: "w-full border-collapse text-sm max-md:block",
  thead: "bg-muted/60 text-muted-foreground border-b text-xs max-md:hidden",
  tbody: "divide-y max-md:block",
  row: "max-md:flex max-md:flex-wrap max-md:items-start max-md:gap-x-5 max-md:gap-y-3 max-md:p-3",
  cell: "px-3 py-2 align-top max-md:p-0",
  /** Celda con su etiqueta encima en el celular (toma el texto de `data-label`). */
  labeled:
    "max-md:before:text-muted-foreground max-md:before:mb-1 max-md:before:block max-md:before:text-xs max-md:before:content-[attr(data-label)]",
  /** Ocupa todo el ancho de la tarjeta en el celular. */
  full: "max-md:basis-full",
} as const;
