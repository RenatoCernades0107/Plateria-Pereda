import { COUNTRIES, joinPhone } from "./countries";

/**
 * Lo escrito en el buscador de clientes se reutiliza al elegir «Crear nuevo cliente»
 * para no volver a escribirlo:
 * - 8 dígitos → DNI;
 * - dígitos que empiezan con 10 o 20 → RUC (el RUC 10 de 11 dígitos lleva el DNI
 *   dentro, que también se propone);
 * - celular peruano (9 dígitos que empiezan con 9, con o sin +51) → teléfono;
 * - número con `+` y prefijo de un país de la lista (+1, +34…) → teléfono de ese país;
 * - texto con `@` (sin espacios) → email;
 * - lo demás → nombre, con mayúsculas corregidas si estaba todo en mayúsculas o
 *   todo en minúsculas (las tildes no se adivinan).
 */
export type SearchPrefill = {
  name?: string;
  phone?: string;
  email?: string;
  ruc?: string;
  dni?: string;
};

export function prefillFromSearch(query: string): SearchPrefill | null {
  const text = query.trim();
  if (!text) return null;
  if (/^[^\s@]+@[^\s@]+$/.test(text)) return { email: text.toLowerCase() };
  // Con `+` y el prefijo de un país conocido: teléfono de ese país.
  if (/^\+[\d\s()-]+$/.test(text)) {
    const digits = text.replace(/\D/g, "");
    const country = [...COUNTRIES]
      .sort((a, b) => b.dial.length - a.dial.length)
      .find((c) => digits.startsWith(c.dial));
    const national = country ? digits.slice(country.dial.length) : "";
    if (country && national.length >= 6) {
      return { phone: joinPhone(country.iso, national) };
    }
  }
  // Solo dígitos, admitiendo espacios, guiones y el prefijo +51.
  if (/^\+?[\d\s-]+$/.test(text)) {
    const digits = text.replace(/\D/g, "");
    if (/^\d{8}$/.test(digits)) return { dni: digits };
    if (/^(10|20)/.test(digits)) {
      return /^10\d{9}$/.test(digits)
        ? { ruc: digits, dni: digits.slice(2, 10) }
        : { ruc: digits };
    }
    const national =
      digits.length === 11 && digits.startsWith("51")
        ? digits.slice(2)
        : digits;
    if (/^9\d{8}$/.test(national)) return { phone: `+51 ${national}` };
  }
  return { name: fixCapitals(text) };
}

// Partículas que van en minúscula dentro de un nombre ("María de la Cruz").
const PARTICLES = new Set(["de", "del", "la", "las", "los", "y", "e"]);
// Siglas de sociedades que se dejan en mayúsculas.
const ACRONYMS = new Set(["sac", "sa", "srl", "eirl", "saa", "sas", "scrl"]);

/**
 * "MARIA FERNANDEZ" o "maria fernandez" → "Maria Fernandez". Si ya mezcla mayúsculas
 * y minúsculas se respeta tal cual. No agrega tildes.
 */
export function fixCapitals(text: string): string {
  const mixed = text !== text.toUpperCase() && text !== text.toLowerCase();
  if (mixed) return text;
  return text
    .toLowerCase()
    .split(/(\s+)/)
    .map((word, i) => {
      if (/^\s+$/.test(word) || !word) return word;
      const letters = word.replace(/[.\s]/g, "");
      if (ACRONYMS.has(letters) && (word.includes(".") || i > 0)) {
        return word.toUpperCase();
      }
      if (i > 0 && PARTICLES.has(word)) return word;
      // Mayúscula al inicio de cada parte: "rojas-pérez" → "Rojas-Pérez", "d'angelo" → "D'Angelo".
      return word.replace(
        /(^|[-'’])(\p{L})/gu,
        (_, sep: string, ch: string) => sep + ch.toUpperCase(),
      );
    })
    .join("");
}

const LABELS: Record<keyof SearchPrefill, string> = {
  name: "Nombre",
  email: "Email",
  ruc: "RUC",
  dni: "DNI",
  phone: "Teléfono",
};

/** Texto corto de lo que se va a proponer, p. ej. «RUC: 20512345678». */
export function describePrefill(prefill: SearchPrefill): string {
  // Del RUC 10 basta con mostrar el RUC: el DNI sale de él.
  const keys = (Object.keys(LABELS) as (keyof SearchPrefill)[]).filter(
    (key) => prefill[key] && !(key === "dni" && prefill.ruc),
  );
  return keys.map((key) => `${LABELS[key]}: ${prefill[key]}`).join(" · ");
}
