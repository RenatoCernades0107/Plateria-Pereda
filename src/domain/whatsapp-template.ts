import { renderTemplate, unknownTemplatePlaceholders } from "./template";

/** Variables que se pueden usar en la plantilla del mensaje de cotización (P25). */
export const WHATSAPP_PLACEHOLDERS = {
  cliente: "Nombre del cliente",
  telefono: "Teléfono del cliente",
  dni: "DNI (u otro documento) del cliente; vacío si no tiene",
  codigo:
    "Código de la restauración (RES-00001) o de la cotización (CWA-00001)",
  piezas:
    "Un bloque por pieza con su descripción, cantidad o servicio y precio",
  total: "Total de la restauración o de la cotización",
  tipo_pago: "Tipo de pago (al contado, a cuenta o al crédito)",
  forma_pago: "Línea con el tipo de pago y el adelanto que corresponde",
  porcentaje_adelanto: "Porcentaje de adelanto",
  adelanto: "Monto del adelanto",
  condiciones: "Términos y condiciones",
} as const;

export type WhatsAppPlaceholder = keyof typeof WHATSAPP_PLACEHOLDERS;

export const DEFAULT_WHATSAPP_TEMPLATE = `Hola {cliente}, te saludamos de Platería Pereda.
Te compartimos la cotización de tu restauración *{codigo}*:

{piezas}

*Total: S/ {total}*
{forma_pago}
{condiciones}`;

/**
 * Mensaje por defecto de las cotizaciones de WhatsApp (CWA): referencial, según las
 * fotos que mandó el cliente; independiente del de las guías.
 */
export const DEFAULT_WHATSAPP_QUOTE_TEMPLATE = `Te compartimos la cotización referencial de restauración, según las fotografías enviadas.

{piezas}

TOTAL REFERENCIAL: S/ {total} aprox.

📌 Esta cotización es referencial y podrá variar una vez que las piezas sean evaluadas físicamente en nuestro taller.

Estaremos encantados de recibir las piezas para evaluarlas y confirmar la cotización. Si lo deseas, también contamos con servicio de recojo.

Cualquier consulta, estaré encantada de atenderte. ☺️`;

/** Variables escritas en la plantilla que no existen (p. ej., "{clienet}"). */
export function unknownPlaceholders(template: string): string[] {
  return unknownTemplatePlaceholders(template, WHATSAPP_PLACEHOLDERS);
}

/** Reemplaza las variables por sus valores; las que no tienen valor quedan vacías. */
export function renderWhatsAppTemplate(
  template: string,
  values: Partial<Record<WhatsAppPlaceholder, string>>,
): string {
  return renderTemplate(template, WHATSAPP_PLACEHOLDERS, values)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
