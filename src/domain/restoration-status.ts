import {
  isClosedStatus,
  isInReview,
  type PieceStatus,
} from "./piece-state-machine";

/**
 * Derivados de las piezas (Todo.md §7.2 y §7.3; P19: el estado general solo
 * avanza; P21 con su propuesta; P47: sin "Recibida" ni "Devuelta por el taller";
 * P48: ubicaciones Por WhatsApp → Sin enviar → En taller → En tienda → Entregada y
 * restauración Rechazada; P50: Observación queda Sin enviar; P54: Parcialmente
 * aprobada; P56: sin "En proceso").
 * En la BD se calculan con una columna generada y un trigger (Paso 8.3); los
 * escenarios de `tests/fixtures/restorations/derivations.json` verifican que ambos
 * lados den lo mismo.
 */

export const RESTORATION_STATUSES = [
  "registrada",
  "parcialmente_aprobada",
  "aprobada",
  "parcialmente_lista",
  "lista",
  "completada",
  "anulada",
  "rechazada",
] as const;
export type RestorationStatus = (typeof RESTORATION_STATUSES)[number];

/**
 * Estado general leído de la BD. "en_proceso" se retiró (P56): queda en el enum de
 * Postgres sin uso (un check lo impide); si llegara, se muestra como Aprobada.
 */
export function toRestorationStatus(
  value: RestorationStatus | "en_proceso",
): RestorationStatus {
  return value === "en_proceso" ? "aprobada" : value;
}

export const RESTORATION_STATUS_LABELS: Record<RestorationStatus, string> = {
  registrada: "Registrada",
  parcialmente_aprobada: "Parcialmente aprobada",
  aprobada: "Aprobada",
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
  /** Revisión en taller: último envío a revisar y última vuelta. */
  reviewSentAt?: Date | null;
  reviewReturnedAt?: Date | null;
};

/** En En restauración y ya de vuelta del taller (la última vuelta es posterior al último envío). */
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
 * (aún no llega) → Sin enviar (en la tienda, por enviar al taller: nunca fue o está
 * en Observación y hay que reenviarla, P50) → En taller (también en revisión) → En
 * tienda (volvió del taller o de la revisión) → Entregada; Anulada aparte.
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
  if (piece.status === "observada") return "sin_enviar";
  // Revisión en taller: en Consulta, Espera o Aprobada, en el taller hasta que vuelve.
  if (
    isInReview(piece) &&
    (piece.status === "en_consulta" ||
      piece.status === "en_espera" ||
      piece.status === "aprobada")
  )
    return "en_taller";
  if (piece.status === "enviada_taller" && !isBackFromWorkshop(piece))
    return "en_taller";
  return piece.firstSentAt || piece.reviewSentAt ? "en_tienda" : "sin_enviar";
}

export type PieceForRestorationStatus = {
  status: PieceStatus;
  approvedAt: Date | null;
  firstSentAt: Date | null;
  /** En En restauración y ya de vuelta del taller. */
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
  if (active.every((p) => p.approvedAt)) return "aprobada";
  if (active.some((p) => p.approvedAt)) return "parcialmente_aprobada";
  return "registrada";
}

/** Orden de avance del estado general (igual al enum de la BD); Anulada y Rechazada son finales. */
const STATUS_RANK: Record<RestorationStatus, number> = {
  registrada: 0,
  parcialmente_aprobada: 1,
  aprobada: 2,
  // 3: "en_proceso", retirado (P56); el valor sigue en el enum de la BD sin uso.
  parcialmente_lista: 4,
  lista: 5,
  completada: 6,
  anulada: 7,
  rechazada: 8,
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

/** Pieza para decidir la orden de Shopify: el precio de venta puede faltar (D58). */
export type PieceForShopifyOrder = Pick<
  PieceForRestorationStatus,
  "status" | "approvedAt"
> & { priceCents: number | null };

/**
 * La orden de Shopify se crea cuando todas las piezas que se cobran fueron aprobadas
 * y tienen precio de venta (y hay al menos una), sin importar el estado general
 * (§7.3, D58). Que la orden aún no exista lo revisa quien encola el trabajo.
 */
export function isReadyForShopifyOrder(
  pieces: readonly PieceForShopifyOrder[],
): boolean {
  const active = pieces.filter((p) => !isClosedStatus(p.status));
  return (
    active.length > 0 &&
    active.every((p) => p.approvedAt && p.priceCents !== null)
  );
}

/** Estados en los que la pieza aún no se aprueba (no se cobra todavía). */
const BEFORE_APPROVAL: readonly PieceStatus[] = [
  "registrada",
  "en_consulta",
  "en_espera",
];

/**
 * Aviso de precios de venta que faltan para Shopify (D58), o null si no falta nada:
 * sin orden, cuando todas las piezas que se cobran están aprobadas pero alguna no
 * tiene precio (la orden espera); con la orden, las piezas aprobadas sin precio (su
 * línea entra cuando se les asigne).
 */
export function missingSalePrices(
  pieces: readonly {
    code: string;
    status: PieceStatus;
    priceCents: number | null;
  }[],
  hasOrder: boolean,
): { codes: string[]; message: string } | null {
  const active = pieces.filter((p) => !isClosedStatus(p.status));
  const approved = active.filter((p) => !BEFORE_APPROVAL.includes(p.status));
  const codes = approved
    .filter((p) => p.priceCents === null)
    .map((p) => p.code);
  if (codes.length === 0) return null;
  if (hasOrder) {
    return {
      codes,
      message: `Faltan precios de venta para agregar a la orden de Shopify: ${codes.join(", ")}.`,
    };
  }
  if (approved.length < active.length) return null;
  return {
    codes,
    message: `Faltan precios de venta para crear la orden de Shopify: ${codes.join(", ")}.`,
  };
}

/** Avance de un estado parcial: "2/6 aprobadas" o "2/6 listas". */
export type PartialProgress = { done: number; total: number; label: string };

/**
 * Cuántas piezas vivas (sin anuladas, rechazadas ni sin arreglo) ya llegaron al
 * paso en los estados parciales; null en los demás estados.
 */
export function partialProgress(
  status: RestorationStatus,
  pieces: readonly PieceForRestorationStatus[],
): PartialProgress | null {
  const active = pieces.filter((p) => !isClosedStatus(p.status));
  if (active.length === 0) return null;
  if (status === "parcialmente_aprobada")
    return {
      done: active.filter((p) => p.approvedAt).length,
      total: active.length,
      label: "aprobadas",
    };
  if (status === "parcialmente_lista")
    return {
      done: active.filter(isBack).length,
      total: active.length,
      label: "listas",
    };
  return null;
}

export function formatPartialProgress(progress: PartialProgress): string {
  return `${progress.done}/${progress.total} ${progress.label}`;
}

/** Piezas en Observación de una restauración, sobre las piezas vivas. */
export type ObservedProgress = { observed: number; total: number };

/**
 * Cuántas de las piezas vivas (sin anuladas, rechazadas ni sin arreglo) están en
 * Observación; null si ninguna lo está, para no mostrar nada.
 */
export function observedProgress(
  pieces: readonly { status: PieceStatus }[],
): ObservedProgress | null {
  const active = pieces.filter((p) => !isClosedStatus(p.status));
  const observed = active.filter((p) => p.status === "observada").length;
  return observed === 0 ? null : { observed, total: active.length };
}

/** "2 de 4 piezas observadas" (con una sola pieza viva: "1 de 1 pieza observada"). */
export function formatObservedProgress({
  observed,
  total,
}: ObservedProgress): string {
  return `${observed} de ${total} ${total === 1 ? "pieza observada" : "piezas observadas"}`;
}
