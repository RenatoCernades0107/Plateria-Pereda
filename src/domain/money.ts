import { formatMoney } from "@/lib/format";

/**
 * Dinero en céntimos enteros (S/ 12.50 = 1250) para que las sumas no arrastren
 * errores de punto flotante (0.1 + 0.2). Se convierte a soles solo al guardar en
 * la BD, enviar a Shopify o mostrar.
 */

export type Cents = number;

/** Tope de un monto: S/ 99,999,999.99 (8 dígitos enteros, como en los catálogos). */
export const MAX_CENTS: Cents = 9_999_999_999;

/**
 * Redondea al entero más cercano; los empates se alejan del cero (1.005 → 1.01).
 * Antes de redondear limpia el ruido binario (100.49999999999999 → 100.5).
 */
function roundHalfAwayFromZero(value: number): number {
  const clean = Number(Math.abs(value).toPrecision(15));
  return Math.sign(value) * Math.round(clean) || 0;
}

/** Soles → céntimos, redondeado a 2 decimales. */
export function toCents(soles: number): Cents {
  return roundHalfAwayFromZero(soles * 100);
}

/** Céntimos → soles (número con 2 decimales como máximo). */
export function toSoles(cents: Cents): number {
  return cents / 100;
}

/** Céntimos → texto decimal con 2 decimales ("1234.50"), como lo piden la BD y Shopify. */
export function toDecimalString(cents: Cents): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Formato para mostrar: "S/ 1,234.50". */
export function formatCents(cents: Cents): string {
  return formatMoney(toSoles(cents));
}

export function sumCents(values: readonly Cents[]): Cents {
  return values.reduce((total, value) => total + value, 0);
}

/** `percent` % de un monto, redondeado a céntimos (50 % de S/ 333.33 = S/ 166.67). */
export function percentOf(cents: Cents, percent: number): Cents {
  return roundHalfAwayFromZero((cents * percent) / 100);
}

/**
 * Lee un monto escrito por el usuario: "1234.5", "1234,50", "1,234.50" o "S/ 12".
 * Devuelve null si no es un monto válido (negativo, más de 2 decimales, texto).
 */
export function parseMoney(text: string): Cents | null {
  const value = text.replace(/^\s*S\/\s*/i, "").trim();
  let normalized: string;
  if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(value)) {
    normalized = value.replace(/,/g, "");
  } else if (/^\d+([.,]\d{1,2})?$/.test(value)) {
    normalized = value.replace(",", ".");
  } else {
    return null;
  }
  const cents = toCents(Number(normalized));
  return cents <= MAX_CENTS ? cents : null;
}

export const PAYMENT_TYPES = [
  "sin_definir",
  "contado",
  "a_cuenta",
  "credito",
] as const;
export type PaymentType = (typeof PAYMENT_TYPES)[number];

export const PAYMENT_TYPE_LABELS: Record<PaymentType, string> = {
  sin_definir: "Por definir",
  contado: "Al contado",
  a_cuenta: "A cuenta",
  credito: "Al crédito",
};

/** % de adelanto por defecto si la configuración no tiene otro (N2). */
/** Estados de pago (P29, pendiente: se usa su propuesta). */
export const PAYMENT_STATUSES = [
  "pendiente",
  "parcial",
  "pagado",
  "reembolsado",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pendiente: "Pago pendiente",
  parcial: "Pago parcial",
  pagado: "Pagado",
  reembolsado: "Reembolsado",
};

export const DEFAULT_DEPOSIT_PERCENT = 50;

/**
 * Adelanto esperado según el tipo de pago (§7.5): el total al contado, el % del
 * total a cuenta y nada al crédito ni mientras el tipo está por definir.
 */
export function expectedDeposit(
  total: Cents,
  paymentType: PaymentType,
  depositPercent: number = DEFAULT_DEPOSIT_PERCENT,
): Cents {
  switch (paymentType) {
    case "contado":
      return total;
    case "a_cuenta":
      return percentOf(total, depositPercent);
    case "sin_definir":
    case "credito":
      return 0;
  }
}
