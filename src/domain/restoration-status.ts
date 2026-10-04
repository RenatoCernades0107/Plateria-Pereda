import type { PieceStatus } from "./piece-state-machine";

/**
 * Derivados de las piezas (Todo.md §7.2 y §7.3, P19 y P21 con su propuesta).
 * En la BD se calculan con una columna generada y un trigger (Paso 8.3); los
 * escenarios de `tests/fixtures/restorations/derivations.json` verifican que ambos
 * lados den lo mismo.
 */

export const RESTORATION_STATUSES = [
  "registrada",
  "aprobada",
  "en_proceso",
  "parcialmente_lista",
  "lista",
  "completada",
  "anulada",
] as const;
export type RestorationStatus = (typeof RESTORATION_STATUSES)[number];

export const RESTORATION_STATUS_LABELS: Record<RestorationStatus, string> = {
  registrada: "Registrada",
  aprobada: "Aprobada",
  en_proceso: "En proceso",
  parcialmente_lista: "Parcialmente lista",
  lista: "Lista",
  completada: "Completada",
  anulada: "Anulada",
};

export const PIECE_LOCATIONS = [
  "por_recibir",
  "en_tienda",
  "en_taller",
  "entregada",
  "anulada",
] as const;
export type PieceLocation = (typeof PIECE_LOCATIONS)[number];

export const PIECE_LOCATION_LABELS: Record<PieceLocation, string> = {
  por_recibir: "Por recibir",
  en_tienda: "En tienda",
  en_taller: "En taller",
  entregada: "Entregada",
  anulada: "Anulada",
};

/** Ubicación física de la pieza (§7.2), evaluada en este orden. */
export function deriveLocation(piece: {
  status: PieceStatus;
  arrivedAt: Date | null;
}): PieceLocation {
  switch (piece.status) {
    case "anulada":
      return "anulada";
    case "entregada":
      return "entregada";
    case "enviada_taller":
      return "en_taller";
    default:
      return piece.arrivedAt ? "en_tienda" : "por_recibir";
  }
}

export type PieceForRestorationStatus = {
  status: PieceStatus;
  approvedAt: Date | null;
  firstSentAt: Date | null;
};

const isBack = (p: PieceForRestorationStatus) =>
  p.status === "devuelta_taller" || p.status === "entregada";

/**
 * Estado general de la restauración (§7.3): ignora las piezas anuladas y aplica
 * las reglas en orden. Puede retroceder, p. ej., si una pieza devuelta se observa
 * y vuelve al taller (P19).
 */
export function deriveRestorationStatus(
  pieces: readonly PieceForRestorationStatus[],
): RestorationStatus {
  const active = pieces.filter((p) => p.status !== "anulada");
  if (active.length === 0) return pieces.length > 0 ? "anulada" : "registrada";
  if (active.every((p) => p.status === "entregada")) return "completada";
  if (active.every(isBack)) return "lista";
  if (active.some(isBack)) return "parcialmente_lista";
  if (active.some((p) => p.firstSentAt)) return "en_proceso";
  if (active.every((p) => p.approvedAt)) return "aprobada";
  return "registrada";
}

/**
 * La orden de Shopify se crea cuando todas las piezas no anuladas fueron aprobadas
 * (y hay al menos una), sin importar el estado general (§7.3). Que la orden aún no
 * exista lo revisa quien encola el trabajo.
 */
export function isReadyForShopifyOrder(
  pieces: readonly Pick<PieceForRestorationStatus, "status" | "approvedAt">[],
): boolean {
  const active = pieces.filter((p) => p.status !== "anulada");
  return active.length > 0 && active.every((p) => p.approvedAt);
}
