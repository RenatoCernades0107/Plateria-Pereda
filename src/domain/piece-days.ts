import {
  isClosedStatus,
  type PieceEvent,
  type PieceStatus,
} from "./piece-state-machine";

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
  /** Por defecto "estado" (un cambio de estado). */
  event?: PieceEvent;
  from: PieceStatus | null;
  to: PieceStatus;
  at: Date;
};

/** Cambios de estado (o retrocesos) que sacan la pieza del flujo y cierran el viaje. */
const TRIP_CLOSING_STATUSES: readonly PieceStatus[] = [
  "registrada",
  "entregada",
  "anulada",
  "rechazada",
  "sin_arreglo",
];

/**
 * Suma de los viajes al taller (igual que `workshop_days` en la BD). Un viaje empieza
 * con "Enviar al taller" (`envio_taller`) o "Llevar a revisar" (`envio_revision`); si
 * ya hay uno abierto, conserva su inicio (enviar al taller desde la revisión es el
 * mismo viaje). Termina con "Recibir del taller", "Volvió de revisión" o un cambio de
 * estado (o retroceso) a Registrada, Entregada, Anulada, Rechazada o Sin arreglo.
 * Incluye los reenvíos por observación (P47). Si la pieza sigue en el taller, el
 * último viaje se cuenta hasta `now`.
 */
export function daysInWorkshop(
  history: readonly StatusHistoryEntry[],
  now: Date,
): DayCount {
  const ordered = [...history].sort((a, b) => a.at.getTime() - b.at.getTime());
  let days = 0;
  let sentAt: Date | null = null;
  for (const entry of ordered) {
    const event = entry.event ?? "estado";
    if (event === "envio_taller" || event === "envio_revision") {
      sentAt ??= entry.at;
    } else if (
      sentAt &&
      (event === "vuelta_taller" ||
        event === "vuelta_revision" ||
        ((event === "estado" || event === "retroceso") &&
          TRIP_CLOSING_STATUSES.includes(entry.to)))
    ) {
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
 * (incluida una observada tras un reclamo) se cuenta hasta `now`; una pieza anulada,
 * rechazada o sin arreglo no tiene días de cumplimiento.
 */
export function fulfillmentDays(
  piece: {
    status: PieceStatus;
    registeredAt: Date;
    deliveredAt: Date | null;
  },
  now: Date,
): DayCount | null {
  if (isClosedStatus(piece.status)) return null;
  if (piece.status === "entregada" && piece.deliveredAt) {
    return {
      days: calendarDaysBetween(piece.registeredAt, piece.deliveredAt),
      ongoing: false,
    };
  }
  return { days: calendarDaysBetween(piece.registeredAt, now), ongoing: true };
}
