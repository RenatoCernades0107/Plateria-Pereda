/** Variables que se pueden usar en la plantilla del mensaje de cotización (P25). */
export const WHATSAPP_PLACEHOLDERS = {
  cliente: "Nombre del cliente",
  codigo: "Código de la restauración (RES-00001)",
  piezas: "Una línea por pieza con su descripción, servicio y precio",
  total: "Total de la restauración",
  porcentaje_adelanto: "Porcentaje de adelanto",
  adelanto: "Monto del adelanto",
  condiciones: "Términos y condiciones",
} as const;

export type WhatsAppPlaceholder = keyof typeof WHATSAPP_PLACEHOLDERS;

export const DEFAULT_WHATSAPP_TEMPLATE = `Hola {cliente}, te saludamos de Platería Pereda.
Te compartimos la cotización de tu restauración *{codigo}*:

{piezas}

*Total: S/ {total}*
Para empezar el trabajo se requiere un adelanto del {porcentaje_adelanto} %: S/ {adelanto}
{condiciones}`;

const PLACEHOLDER = /\{([^{}]*)\}/g;

/** Variables escritas en la plantilla que no existen (p. ej., "{clienet}"). */
export function unknownPlaceholders(template: string): string[] {
  const found = [...template.matchAll(PLACEHOLDER)].map((m) => m[1] ?? "");
  return [...new Set(found.filter((name) => !(name in WHATSAPP_PLACEHOLDERS)))];
}

/** Reemplaza las variables por sus valores; las que no tienen valor quedan vacías. */
export function renderWhatsAppTemplate(
  template: string,
  values: Partial<Record<WhatsAppPlaceholder, string>>,
): string {
  return template
    .replace(PLACEHOLDER, (match, name: string) =>
      name in WHATSAPP_PLACEHOLDERS
        ? (values[name as WhatsAppPlaceholder] ?? "")
        : match,
    )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
