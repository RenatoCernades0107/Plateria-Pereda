import { percentOf, sumCents, type Cents } from "./money";

/**
 * Cálculos de la cotización (Fase 14). Mismas reglas que la BD (migración
 * `cotizaciones`): subtotal de la línea = cantidad × precio; descuento opcional por
 * línea en monto o % (P35, propuesta) redondeado a céntimos; total = suma de las
 * líneas (con su descuento), tal como se escriben los precios.
 */

export const QUOTE_STATUSES = [
  "borrador",
  "emitida",
  "aceptada",
  "rechazada",
] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

/** Estado que se muestra: "vencida" no se guarda, se calcula con la vigencia. */
export type QuoteDisplayStatus = QuoteStatus | "vencida";

export const QUOTE_STATUS_LABELS: Record<QuoteDisplayStatus, string> = {
  borrador: "Borrador",
  emitida: "Emitida",
  aceptada: "Aceptada",
  rechazada: "Rechazada",
  vencida: "Vencida",
};

/** Cambios de estado permitidos (los mismos que valida el trigger de la BD). */
const TRANSITIONS: Record<QuoteStatus, readonly QuoteStatus[]> = {
  borrador: ["emitida"],
  emitida: ["aceptada", "rechazada"],
  aceptada: ["emitida"],
  rechazada: ["emitida"],
};

export function nextQuoteStatuses(from: QuoteStatus): readonly QuoteStatus[] {
  return TRANSITIONS[from];
}

export function canChangeQuoteStatus(
  from: QuoteStatus,
  to: QuoteStatus,
): boolean {
  return TRANSITIONS[from].includes(to);
}

export const MAX_QUOTE_QUANTITY = 100_000;
/** Vigencia si la configuración no tiene otra (P36, propuesta). */
export const DEFAULT_QUOTE_VALIDITY_DAYS = 15;

/** Forma de pago que se muestra en el PDF bajo "Son:" ("Condición:"). */
export const QUOTE_PAYMENT_CONDITIONS = [
  "contado",
  "credito",
  "a_cuenta",
] as const;
export type QuotePaymentCondition = (typeof QUOTE_PAYMENT_CONDITIONS)[number];
export const QUOTE_PAYMENT_CONDITION_LABELS: Record<
  QuotePaymentCondition,
  string
> = {
  contado: "Al contado",
  credito: "Al crédito",
  a_cuenta: "A cuenta",
};
export const DEFAULT_QUOTE_PAYMENT_CONDITION: QuotePaymentCondition = "contado";
/** Tiempo de entrega por defecto, en días hábiles desde la aprobación. */
export const DEFAULT_QUOTE_DELIVERY_DAYS = 30;

export type LineDiscount =
  | { type: "monto"; cents: Cents }
  | { type: "porcentaje"; percent: number }
  | null;

export type QuoteLineAmounts = {
  quantity: number;
  unitPrice: Cents;
  discount?: LineDiscount;
};

/** Cantidad × precio unitario. */
export function lineGross(line: QuoteLineAmounts): Cents {
  return line.quantity * line.unitPrice;
}

/** Descuento de la línea en céntimos; nunca mayor que su subtotal. */
export function lineDiscount(line: QuoteLineAmounts): Cents {
  const gross = lineGross(line);
  const discount = line.discount;
  if (!discount) return 0;
  const amount =
    discount.type === "monto"
      ? discount.cents
      : percentOf(gross, Math.min(discount.percent, 100));
  return Math.min(Math.max(amount, 0), gross);
}

export function lineTotal(line: QuoteLineAmounts): Cents {
  return lineGross(line) - lineDiscount(line);
}

export type QuoteTotals = {
  /** Suma de cantidad × precio. */
  subtotal: Cents;
  /** Suma de los descuentos por línea. */
  discount: Cents;
  /** Lo que paga el cliente: subtotal menos descuentos. */
  total: Cents;
};

/** Subtotal, descuentos y total de las líneas. */
export function quoteTotals(lines: readonly QuoteLineAmounts[]): QuoteTotals {
  return {
    subtotal: sumCents(lines.map(lineGross)),
    discount: sumCents(lines.map(lineDiscount)),
    total: sumCents(lines.map(lineTotal)),
  };
}

// --- Vigencia (fechas calendario en Lima, como `private.lima_today()` de la BD) ---

export const QUOTE_TIME_ZONE = "America/Lima";

const limaDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: QUOTE_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Fecha calendario en Lima ("2026-10-04") de un instante. */
export function limaDateOf(instant: Date): string {
  return limaDate.format(instant);
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Suma días a una fecha calendario "AAAA-MM-DD" (sin horas: no le afecta la zona). */
export function addDays(date: string, days: number): string {
  const match = ISO_DATE.exec(date);
  if (!match) throw new Error(`Fecha inválida: ${date}`);
  const [, y, m, d] = match;
  const utc = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d) + days));
  return utc.toISOString().slice(0, 10);
}

/** Último día de vigencia: fecha de emisión + días de vigencia. */
export function quoteValidUntil(
  issueDate: string,
  validityDays: number,
): string {
  return addDays(issueDate, validityDays);
}

/** Vencida cuando hoy (en Lima) ya pasó el último día de vigencia. */
export function isQuoteExpired(
  validUntil: string | null,
  now: Date = new Date(),
): boolean {
  return validUntil !== null && limaDateOf(now) > validUntil;
}

export function quoteDisplayStatus(
  status: QuoteStatus,
  validUntil: string | null,
  now: Date = new Date(),
): QuoteDisplayStatus {
  return status === "emitida" && isQuoteExpired(validUntil, now)
    ? "vencida"
    : status;
}

/** Fecha calendario "AAAA-MM-DD" → "DD/MM/AAAA" (sin pasar por zonas horarias). */
export function formatQuoteDate(date: string): string {
  const match = ISO_DATE.exec(date);
  if (!match) return date;
  const [, y, m, d] = match;
  return `${d}/${m}/${y}`;
}

const longDateFormat = new Intl.DateTimeFormat("es-PE", {
  timeZone: "UTC",
  day: "numeric",
  month: "long",
  year: "numeric",
});

/** Fecha calendario "AAAA-MM-DD" → "17 de agosto de 2026" (para el PDF, Paso 14.5). */
export function formatQuoteDateLong(date: string): string {
  const match = ISO_DATE.exec(date);
  if (!match) return date;
  const [, y, m, d] = match;
  return longDateFormat.format(
    new Date(Date.UTC(Number(y), Number(m) - 1, Number(d))),
  );
}
