import type { RestorationStatus } from "@/domain/restoration-status";

/**
 * Colores de las barras apiladas. Los estados siguen una sola rampa cobre (más oscuro =
 * más avanzado) y lo que se cerró sin llegar a entregarse va en gris. Cada segmento lleva
 * además su nombre y su número en la leyenda: el color nunca es lo único que distingue.
 */
export const RESTORATION_STATUS_COLORS: Record<RestorationStatus, string> = {
  registrada: "bg-viz-seq-200",
  parcialmente_aprobada: "bg-viz-seq-300",
  aprobada: "bg-viz-seq-400",
  parcialmente_lista: "bg-viz-seq-500",
  lista: "bg-viz-seq-600",
  completada: "bg-viz-seq-700",
  anulada: "bg-muted-foreground/35",
  rechazada: "bg-muted-foreground/60",
};

export const WHATSAPP_STATUS_COLORS = {
  cotizada: "bg-viz-seq-300",
  pedida_parcial: "bg-viz-seq-500",
  pedida: "bg-viz-seq-700",
  descartada: "bg-muted-foreground/45",
} as const;

export const COT_STATUS_COLORS = {
  borrador: "bg-muted-foreground/35",
  emitida: "bg-viz-seq-300",
  aceptada: "bg-viz-seq-600",
  rechazada: "bg-muted-foreground/60",
  vencida: "bg-viz-seq-200",
} as const;

/** Un color por serie categórica, en orden fijo (nunca se cicla ni se reasigna). */
export const SERIES_COLORS = [
  "var(--viz-1)",
  "var(--viz-2)",
  "var(--viz-3)",
  "var(--viz-4)",
  "var(--viz-5)",
  "var(--viz-6)",
] as const;
