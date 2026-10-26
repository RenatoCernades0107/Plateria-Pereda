import type { Cents } from "./money";

/**
 * Monto en letras para el "Son:" de la cotización en PDF (Paso 14.5), p. ej.
 * `S/ 1,906.78` → "MIL NOVECIENTOS SEIS Y 78/100 SOLES".
 */

const UNITS = [
  "",
  "UNO",
  "DOS",
  "TRES",
  "CUATRO",
  "CINCO",
  "SEIS",
  "SIETE",
  "OCHO",
  "NUEVE",
];
const TEENS = [
  "DIEZ",
  "ONCE",
  "DOCE",
  "TRECE",
  "CATORCE",
  "QUINCE",
  "DIECISEIS",
  "DIECISIETE",
  "DIECIOCHO",
  "DIECINUEVE",
];
const TWENTIES = [
  "VEINTE",
  "VEINTIUNO",
  "VEINTIDOS",
  "VEINTITRES",
  "VEINTICUATRO",
  "VEINTICINCO",
  "VEINTISEIS",
  "VEINTISIETE",
  "VEINTIOCHO",
  "VEINTINUEVE",
];
const TENS = [
  "",
  "",
  "",
  "TREINTA",
  "CUARENTA",
  "CINCUENTA",
  "SESENTA",
  "SETENTA",
  "OCHENTA",
  "NOVENTA",
];
const HUNDREDS = [
  "",
  "CIENTO",
  "DOSCIENTOS",
  "TRESCIENTOS",
  "CUATROCIENTOS",
  "QUINIENTOS",
  "SEISCIENTOS",
  "SETECIENTOS",
  "OCHOCIENTOS",
  "NOVECIENTOS",
];

/** "UNO" → "UN", "VEINTIUNO" → "VEINTIUN" (apócope ante un sustantivo masculino). */
function apocopate(word: string): string {
  return word.endsWith("UNO") ? word.slice(0, -1) : word;
}

/** 0-99. */
function twoDigits(n: number): string {
  if (n < 10) return UNITS[n]!;
  if (n < 20) return TEENS[n - 10]!;
  if (n < 30) return TWENTIES[n - 20]!;
  const ten = Math.floor(n / 10);
  const unit = n % 10;
  return unit === 0 ? TENS[ten]! : `${TENS[ten]} Y ${UNITS[unit]}`;
}

/** 0-999. */
function threeDigits(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "CIEN";
  const hundred = Math.floor(n / 100);
  const rest = n % 100;
  return [hundred > 0 ? HUNDREDS[hundred] : "", rest > 0 ? twoDigits(rest) : ""]
    .filter(Boolean)
    .join(" ");
}

/** Parte entera, 0 a 999 999 999 (sin "SOLES"): "MIL NOVECIENTOS SEIS". */
function integerWords(n: number): string {
  if (n === 0) return "CERO";
  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;
  const parts: string[] = [];
  if (millions > 0) {
    parts.push(
      millions === 1
        ? "UN MILLON"
        : `${apocopate(threeDigits(millions))} MILLONES`,
    );
  }
  if (thousands > 0) {
    parts.push(
      thousands === 1 ? "MIL" : `${apocopate(threeDigits(thousands))} MIL`,
    );
  }
  if (rest > 0) parts.push(threeDigits(rest));
  return parts.join(" ");
}

/**
 * Monto en céntimos → letras en mayúsculas, como se escribe en el "Son:" de un
 * comprobante: "MIL NOVECIENTOS SEIS Y 78/100 SOLES". Los céntimos negativos no se
 * contemplan (los montos de la cotización nunca lo son).
 */
export function amountInWords(cents: Cents): string {
  const value = Math.max(0, Math.round(cents));
  const soles = Math.trunc(value / 100);
  const centavos = value % 100;
  return `${integerWords(soles)} Y ${String(centavos).padStart(2, "0")}/100 SOLES`;
}
