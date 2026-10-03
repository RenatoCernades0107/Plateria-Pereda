import type { Money } from "./types";

/** Convierte "200.5" en 20050 céntimos. */
export function toCents(amount: Money): number {
  if (!/^-?\d+(\.\d{1,2})?$/.test(amount.trim())) {
    throw new Error(`Monto inválido: ${amount}`);
  }
  const [whole = "0", decimals = ""] = amount
    .trim()
    .replace("-", "")
    .split(".");
  const cents = Number(whole) * 100 + Number(decimals.padEnd(2, "0"));
  return amount.trim().startsWith("-") ? -cents : cents;
}

/** Convierte 20050 céntimos en "200.50". */
export function fromCents(cents: number): Money {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}
