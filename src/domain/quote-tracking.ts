/**
 * Seguimiento de la cotización aprobada (pedido del 2026-11-11): dónde está el trabajo
 * y qué taller lo hace. Solo existen en las aceptadas y facturadas; el taller lo asignan
 * logística y el admin, la ubicación también ventas.
 */

export const QUOTE_WORK_LOCATIONS = [
  "en_taller",
  "en_tienda",
  "entregado",
] as const;
export type QuoteWorkLocation = (typeof QUOTE_WORK_LOCATIONS)[number];

export const QUOTE_WORK_LOCATION_LABELS: Record<QuoteWorkLocation, string> = {
  en_taller: "En taller",
  en_tienda: "En tienda",
  entregado: "Entregado",
};

/** Estados en los que la cotización tiene taller, ubicación y pagos. */
export const QUOTE_TRACKED_STATUSES = ["aceptada", "facturada"] as const;

export function isQuoteTracked(status: string): boolean {
  return (QUOTE_TRACKED_STATUSES as readonly string[]).includes(status);
}

export function isQuoteWorkLocation(
  value: unknown,
): value is QuoteWorkLocation {
  return (
    typeof value === "string" &&
    (QUOTE_WORK_LOCATIONS as readonly string[]).includes(value)
  );
}
