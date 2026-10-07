import { isClosedStatus, type PieceStatus } from "./piece-state-machine";

/**
 * Derivados de las piezas (Todo.md §7.2 y §7.3; P19: el estado general solo
 * avanza; P21 con su propuesta; P47: sin "Recibida" ni "Devuelta por el taller";
 * P48: ubicaciones Por WhatsApp → Sin enviar → En taller → En tienda → Entregada y
 * restauración Rechazada).
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
  "rechazada",
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
  rechazada: "Rechazada",
};

/** Origen de la restauración (P46): oficina o copiada de una cotización de WhatsApp. */
export const RESTORATION_ORIGINS = ["oficina", "whatsapp"] as const;
export type RestorationOrigin = (typeof RESTORATION_ORIGINS)[number];

export const RESTORATION_ORIGIN_LABELS: Record<RestorationOrigin, string> = {
  oficina: "Oficina",
  whatsapp: "WhatsApp",
};

/** Recorrido físico de la pieza (P48), más "Anulada" para las piezas anuladas. */
export const PIECE_LOCATIONS = [
  "por_whatsapp",
  "sin_enviar",
  "en_taller",
  "en_tienda",
  "entregada",
  "anulada",
] as const;
export type PieceLocation = (typeof PIECE_LOCATIONS)[number];

export const PIECE_LOCATION_LABELS: Record<PieceLocation, string> = {
  por_whatsapp: "Por WhatsApp",
  sin_enviar: "Sin enviar",
  en_taller: "En taller",
  en_tienda: "En tienda",
  entregada: "Entregada",
  anulada: "Anulada",
};

/** Lo que la ubicación necesita saber de la pieza. */
export type PieceForLocation = {
  status: PieceStatus;
  arrivedAt: Date | null;
  firstSentAt?: Date | null;
  lastSentAt?: Date | null;
  lastReturnedAt?: Date | null;
  returnedAt?: Date | null;
};

/** En Interno y ya de vuelta del taller (la última vuelta es posterior al último envío). */
export function isBackFromWorkshop(piece: PieceForLocation): boolean {
  return (
    piece.status === "enviada_taller" &&
    !!piece.lastReturnedAt &&
    !!piece.lastSentAt &&
    piece.lastReturnedAt.getTime() >= piece.lastSentAt.getTime()
  );
}

/**
 * Ubicación física de la pieza (§7.2, P48), evaluada en este orden: Por WhatsApp
 * (aún no llega) → Sin enviar (en la tienda, nunca fue al taller) → En taller → En
 * tienda (volvió del taller) → Entregada; Anulada aparte.
 */
export function deriveLocation(piece: PieceForLocation): PieceLocation {
  if (piece.status === "anulada") return "anulada";
  if (piece.status === "entregada") return "entregada";
  if (
    (piece.status === "rechazada" || piece.status === "sin_arreglo") &&
    piece.returnedAt
  )
    return "entregada";
  if (!piece.arrivedAt) return "por_whatsapp";
  if (piece.status === "enviada_taller" && !isBackFromWorkshop(piece))
    return "en_taller";
  return piece.firstSentAt ? "en_tienda" : "sin_enviar";
}

export type PieceForRestorationStatus = {
  status: PieceStatus;
  approvedAt: Date | null;
  firstSentAt: Date | null;
  /** En Interno y ya de vuelta del taller. */
  readyForDelivery: boolean;
};

const isBack = (p: PieceForRestorationStatus) =>
  p.readyForDelivery || p.status === "entregada";

/**
 * Estado general calculado de las piezas (§7.3): ignora las piezas finales
 * (anuladas, rechazadas y sin arreglo) y aplica las reglas en orden. Si todas son
 * finales queda Rechazada si alguna fue rechazada o sin arreglo, y Anulada si todas
 * se anularon (P48). El que se guarda solo avanza (`advanceRestorationStatus`, P19).
 */
export function deriveRestorationStatus(
  pieces: readonly PieceForRestorationStatus[],
): RestorationStatus {
  const active = pieces.filter((p) => !isClosedStatus(p.status));
  if (active.length === 0) {
    if (pieces.length === 0) return "registrada";
    return pieces.some((p) => p.status !== "anulada") ? "rechazada" : "anulada";
  }
  if (active.every((p) => p.status === "entregada")) return "completada";
  if (active.every(isBack)) return "lista";
  if (active.some(isBack)) return "parcialmente_lista";
  if (active.some((p) => p.firstSentAt)) return "en_proceso";
  if (active.every((p) => p.approvedAt)) return "aprobada";
  return "registrada";
}

/** Orden de avance del estado general (igual al enum de la BD); Anulada y Rechazada son finales. */
const STATUS_RANK: Record<RestorationStatus, number> = {
  registrada: 0,
  aprobada: 1,
  en_proceso: 2,
  parcialmente_lista: 3,
  lista: 4,
  completada: 5,
  anulada: 6,
  rechazada: 7,
};

/**
 * Estado que se guarda (P19: solo avanza). Si lo calculado retrocede —p. ej. una
 * pieza lista se observa y vuelve al taller— se conserva el estado alcanzado;
 * si se anulan todas las piezas queda Anulada.
 */
export function advanceRestorationStatus(
  current: RestorationStatus,
  derived: RestorationStatus,
): RestorationStatus {
  return STATUS_RANK[derived] > STATUS_RANK[current] ? derived : current;
}

/**
 * La orden de Shopify se crea cuando todas las piezas que se cobran fueron aprobadas
 * (y hay al menos una), sin importar el estado general (§7.3). Que la orden aún no
 * exista lo revisa quien encola el trabajo.
 */
export function isReadyForShopifyOrder(
  pieces: readonly Pick<PieceForRestorationStatus, "status" | "approvedAt">[],
): boolean {
  const active = pieces.filter((p) => !isClosedStatus(p.status));
  return active.length > 0 && active.every((p) => p.approvedAt);
}
