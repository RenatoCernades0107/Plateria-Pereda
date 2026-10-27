/**
 * Fechas estimadas de entrega de las piezas urgentes (2026-10-27): al cliente
 * (obligatoria) y del taller (opcional, nunca posterior a la del cliente). Son fechas de
 * calendario (AAAA-MM-DD, sin hora) en la zona de la tienda.
 */

const TIME_ZONE = "America/Lima";

export const DELIVERY_DATE_REQUIRED = "Indica la fecha estimada de entrega";
export const DELIVERY_DATE_INVALID = "Ingresa una fecha válida";
export const WORKSHOP_DATE_AFTER_CLIENT =
  "La fecha del taller no puede ser posterior a la del cliente";

const todayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
});

/** Hoy en Lima (AAAA-MM-DD). */
export function todayInLima(now: Date = new Date()): string {
  return todayFormatter.format(now);
}

/** AAAA-MM-DD que existe en el calendario (rechaza 2026-02-30). */
export function isIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  ];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

const MONTHS = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];

/**
 * "30 oct" (con el año si no es el actual). No pasa por `Date` para que la zona
 * horaria no corra el día.
 */
export function formatDeliveryDate(
  value: string,
  now: Date = new Date(),
): string {
  if (!isIsoDate(value)) return value;
  const [year, month, day] = value.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const label = `${day} ${MONTHS[month - 1]}`;
  return year === Number(todayInLima(now).slice(0, 4))
    ? label
    : `${label} ${year}`;
}

/** La fecha ya pasó (la pieza urgente sigue abierta y se prometió para antes de hoy). */
export function isDeliveryOverdue(
  value: string,
  now: Date = new Date(),
): boolean {
  return isIsoDate(value) && value < todayInLima(now);
}
