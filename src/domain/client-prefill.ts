/**
 * Lo escrito en el buscador de clientes se reutiliza al elegir «Crear nuevo cliente»
 * para no volver a escribirlo:
 * - 8 dígitos → DNI;
 * - dígitos que empiezan con 10 o 20 → RUC (el RUC 10 de 11 dígitos lleva el DNI
 *   dentro, que también se propone);
 * - celular peruano (9 dígitos que empiezan con 9, con o sin +51) → teléfono;
 * - lo demás → nombre.
 */
export type SearchPrefill = {
  name?: string;
  phone?: string;
  ruc?: string;
  dni?: string;
};

export function prefillFromSearch(query: string): SearchPrefill | null {
  const text = query.trim();
  if (!text) return null;
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
  return { name: text };
}

const LABELS: Record<keyof SearchPrefill, string> = {
  name: "Nombre",
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
