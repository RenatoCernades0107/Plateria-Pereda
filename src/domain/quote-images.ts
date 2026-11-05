/**
 * Fotos referenciales de las líneas de la cotización (pedido del 2026-11-05). Viven en
 * el bucket privado `quote-images` bajo `{usuario}/{uuid}.{ext}` (la misma regla que
 * valida la BD), así se suben antes de guardar una cotización nueva.
 */

export const QUOTE_IMAGES_BUCKET = "quote-images";

/** Tipos aceptados (jsPDF y todos los navegadores los dibujan). */
export const QUOTE_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

/** 10 MB, como el límite del bucket. */
export const QUOTE_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

export const QUOTE_IMAGE_PATH =
  /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$/;

const EXTENSIONS: Record<(typeof QUOTE_IMAGE_TYPES)[number], string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function isQuoteImageType(
  type: string,
): type is (typeof QUOTE_IMAGE_TYPES)[number] {
  return (QUOTE_IMAGE_TYPES as readonly string[]).includes(type);
}

/** Ruta nueva para la foto de `userId` (null si el tipo no se acepta). */
export function quoteImagePath(
  userId: string,
  type: string,
  id: string = globalThis.crypto.randomUUID(),
): string | null {
  if (!isQuoteImageType(type)) return null;
  return `${userId.toLowerCase()}/${id}.${EXTENSIONS[type]}`;
}
