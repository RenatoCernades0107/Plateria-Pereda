import type { PieceStatus } from "./piece-state-machine";

/**
 * Días en taller y días de cumplimiento (Todo.md §7.4; P23 con su propuesta):
 * días calendario en la zona de la tienda, no horas transcurridas.
 */

export const APP_TIME_ZONE = "America/Lima";

const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const MS_PER_DAY = 86_400_000;

/** Días desde 1970-01-01 de la fecha calendario en Lima. */
function limaDayNumber(date: Date): number {
  const parts = dayFormatter.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(part("year"), part("month") - 1, part("day")) / MS_PER_DAY;
}

/** Días calendario (en Lima) entre dos instantes; nunca negativo. */
export function calendarDaysBetween(start: Date, end: Date): number {
  return Math.max(0, limaDayNumber(end) - limaDayNumber(start));
}

export type DayCount = {
  days: number;
  /** El conteo sigue abierto (se contó hasta `now`). */
  ongoing: boolean;
};

export type StatusHistoryEntry = {
  from: PieceStatus | null;
  to: PieceStatus;
  at: Date;
};

/**
 * Suma de los viajes al taller: de cada "Enviada al taller" a la siguiente salida
 * de ese estado (incluye reenvíos por observación). Si la pieza sigue en el
 * taller, el último viaje se cuenta hasta `now`.
 */
export function daysInWorkshop(
  history: readonly StatusHistoryEntry[],
  now: Date,
): DayCount {
  const ordered = [...history].sort((a, b) => a.at.getTime() - b.at.getTime());
  let days = 0;
  let sentAt: Date | null = null;
  for (const entry of ordered) {
    if (entry.to === "enviada_taller") {
      sentAt ??= entry.at;
    } else if (sentAt) {
      days += calendarDaysBetween(sentAt, entry.at);
      sentAt = null;
    }
  }
  return sentAt
    ? { days: days + calendarDaysBetween(sentAt, now), ongoing: true }
    : { days, ongoing: false };
}

/**
 * Días desde el registro de la pieza hasta su entrega. Mientras no esté entregada
 * (incluida una observada tras un reclamo) se cuenta hasta `now`; una pieza anulada
 * no tiene días de cumplimiento.
 */
export function fulfillmentDays(
  piece: {
    status: PieceStatus;
    registeredAt: Date;
    deliveredAt: Date | null;
  },
  now: Date,
): DayCount | null {
  if (piece.status === "anulada") return null;
  if (piece.status === "entregada" && piece.deliveredAt) {
    return {
      days: calendarDaysBetween(piece.registeredAt, piece.deliveredAt),
      ongoing: false,
    };
  }
  return { days: calendarDaysBetween(piece.registeredAt, now), ongoing: true };
}
