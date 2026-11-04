/**
 * Lo escrito en el buscador de clientes se reutiliza al elegir «Crear nuevo cliente»
 * para no volver a escribirlo: un RUC de empresa (empieza con 20) va al RUC, un
 * celular peruano (9 dígitos que empiezan con 9) al teléfono y lo demás al nombre.
 */
export type SearchPrefill =
  | { field: "name"; value: string }
  | { field: "ruc"; value: string }
  | { field: "phone"; value: string };

export function prefillFromSearch(query: string): SearchPrefill | null {
  const text = query.trim();
  if (!text) return null;
  // Solo dígitos, admitiendo espacios, guiones y el prefijo +51.
  if (/^\+?[\d\s-]+$/.test(text)) {
    const digits = text.replace(/\D/g, "");
    if (digits.startsWith("20")) return { field: "ruc", value: digits };
    const national =
      digits.length === 11 && digits.startsWith("51")
        ? digits.slice(2)
        : digits;
    if (/^9\d{8}$/.test(national)) {
      return { field: "phone", value: `+51 ${national}` };
    }
  }
  return { field: "name", value: text };
}
