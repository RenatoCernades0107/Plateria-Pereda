/**
 * Normaliza un teléfono al formato E.164 que usa Shopify (+51999888777).
 * Acepta celulares peruanos (9 dígitos que empiezan con 9), fijos de Lima
 * (01 + 7 dígitos) y de provincias (0 + código de 2 dígitos + 6 dígitos), con o sin
 * +51, espacios, guiones o paréntesis, y números de otros países escritos con +.
 * Devuelve null si no es un teléfono válido.
 */
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const hasPlus = trimmed.startsWith("+");
  if (/[^\d\s()+-]/.test(trimmed) || trimmed.lastIndexOf("+") > 0) return null;
  let digits = trimmed.replace(/\D/g, "");

  if (hasPlus && !digits.startsWith("51")) {
    return /^[1-9]\d{6,14}$/.test(digits) ? `+${digits}` : null;
  }
  if (digits.startsWith("51") && (hasPlus || digits.length > 9)) {
    digits = digits.slice(2);
  }
  // Celular: 9XXXXXXXX
  if (/^9\d{8}$/.test(digits)) return `+51${digits}`;
  // Fijo de Lima: 01 + 7 dígitos (en E.164 sin el 0: +511XXXXXXX)
  if (/^01\d{7}$/.test(digits)) return `+51${digits.slice(1)}`;
  if (/^1\d{7}$/.test(digits)) return `+51${digits}`;
  // Fijo de provincia: 0 + código de 2 dígitos + 6 dígitos
  if (/^0[4-8]\d{7}$/.test(digits)) return `+51${digits.slice(1)}`;
  if (/^[4-8]\d{7}$/.test(digits)) return `+51${digits}`;
  return null;
}

/** Muestra un E.164 peruano de forma legible: +51 999 888 777. */
export function formatPhone(e164: string): string {
  const mobile = /^\+51(9\d{2})(\d{3})(\d{3})$/.exec(e164);
  if (mobile) return `+51 ${mobile[1]} ${mobile[2]} ${mobile[3]}`;
  const lima = /^\+51(1)(\d{3})(\d{4})$/.exec(e164);
  if (lima) return `+51 ${lima[1]} ${lima[2]} ${lima[3]}`;
  return e164;
}
