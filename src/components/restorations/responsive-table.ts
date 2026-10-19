/**
 * Clases para que una tabla de piezas se vea como tarjetas en el celular: en pantallas
 * chicas las filas se apilan y cada celda lleva su etiqueta (`data-label`), así no hay
 * que desplazarse de lado para ver el estado o el taller. Desde `md` es una tabla.
 */
/** Fondo del encabezado, en `--row-tint` (lo pintan también las columnas fijas). */
const HEAD_TINT =
  "[--row-tint:color-mix(in_oklab,var(--muted)_60%,transparent)] bg-(--row-tint)";

export const RT = {
  wrapper: "relative rounded-lg border md:overflow-x-auto",
  table: "w-full border-collapse text-sm max-md:block",
  thead: `${HEAD_TINT} text-muted-foreground border-b text-xs max-md:hidden`,
  tbody: "divide-y max-md:block",
  row: "bg-(--row-tint) max-md:flex max-md:flex-wrap max-md:items-start max-md:gap-x-5 max-md:gap-y-3 max-md:p-3",
  cell: "px-3 py-2 align-top max-md:p-0",
  /** Celda con su etiqueta encima en el celular (toma el texto de `data-label`). */
  labeled:
    "max-md:before:text-muted-foreground max-md:before:mb-1 max-md:before:block max-md:before:text-xs max-md:before:content-[attr(data-label)]",
  /** Ocupa todo el ancho de la tarjeta en el celular. */
  full: "max-md:basis-full",
  headTint: HEAD_TINT,
  /** Tono de la fila al pasar el ratón (en `--row-tint`, ver `sticky`). */
  hoverRow:
    "hover:[--row-tint:color-mix(in_oklab,var(--muted)_30%,transparent)]",
  /** Tono de alerta de la fila (p. ej. mucho tiempo en el taller). */
  alertRow:
    "[--row-tint:color-mix(in_oklab,var(--destructive)_5%,transparent)]",
  /**
   * Columna fija a la izquierda al desplazarse de lado, solo desde `md` (en el celular
   * son tarjetas). Fondo opaco con el tono de la fila (`--row-tint`) encima, para tapar
   * las celdas que pasan por debajo. Cada uso agrega su `left-*` y un ancho fijo.
   */
  sticky:
    "md:sticky md:z-10 md:bg-background md:bg-[image:linear-gradient(var(--row-tint,transparent),var(--row-tint,transparent))]",
  /**
   * Borde y sombra a la derecha de la última columna fija. Con sombras y no `border`:
   * con `border-collapse` el borde queda en la grilla y no acompaña a la celda.
   */
  stickyEdge:
    "md:shadow-[inset_-1px_0_0_var(--border),4px_0_6px_-4px_rgb(0_0_0/0.12)]",
} as const;
