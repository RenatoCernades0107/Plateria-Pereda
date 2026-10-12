/**
 * Fotos y archivos de las restauraciones (Fase 10, P32 con su propuesta): JPG, PNG,
 * WebP, HEIC y PDF, hasta 10 MB; las fotos se comprimen en el navegador (lado mayor
 * 1920 px); clasificación Antes / Después / Documento / Otro. La BD y el bucket
 * aplican los mismos límites.
 */

export const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** Lado mayor de las fotos comprimidas, en píxeles. */
export const MAX_IMAGE_SIDE = 1920;

export const FILE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "application/pdf": "pdf",
} as const;
export type FileMimeType = keyof typeof FILE_TYPES;

/** Para el `accept` del selector de archivos. */
export const FILE_ACCEPT = [
  ...Object.keys(FILE_TYPES),
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".heic",
  ".heif",
  ".pdf",
].join(",");

export const FILE_CATEGORIES = [
  "antes",
  "despues",
  "documento",
  "otro",
] as const;
export type FileCategory = (typeof FILE_CATEGORIES)[number];

export const FILE_CATEGORY_LABELS: Record<FileCategory, string> = {
  antes: "Antes",
  despues: "Después",
  documento: "Documento",
  otro: "Otro",
};

/** Tipo del archivo: el que informa el navegador o, si no lo sabe (HEIC en Windows), por la extensión. */
export function fileMimeType(file: {
  name: string;
  type: string;
}): FileMimeType | null {
  if (file.type in FILE_TYPES) return file.type as FileMimeType;
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  if (file.type && file.type !== "application/octet-stream") return null;
  const byExt: Record<string, FileMimeType> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    heic: "image/heic",
    heif: "image/heif",
    pdf: "application/pdf",
  };
  return byExt[ext] ?? null;
}

/** Mensaje de error si el archivo no se puede subir; null si está bien. */
export function fileError(file: {
  name: string;
  type: string;
  size: number;
}): string | null {
  if (!fileMimeType(file))
    return `«${file.name}»: solo se aceptan fotos (JPG, PNG, WebP, HEIC) y PDF.`;
  if (file.size === 0) return `«${file.name}» está vacío.`;
  if (file.size > MAX_FILE_BYTES) return `«${file.name}» pesa más de 10 MB.`;
  return null;
}

/**
 * Si la foto se comprime en el navegador: JPG, PNG y WebP. HEIC no (los navegadores,
 * salvo Safari, no lo pueden leer) y los PDF tampoco.
 */
export function isCompressible(type: string): boolean {
  return type === "image/jpeg" || type === "image/png" || type === "image/webp";
}

export function isImage(type: string): boolean {
  return type.startsWith("image/");
}

/** Medidas al reducir para que el lado mayor no pase de `MAX_IMAGE_SIDE`. */
export function scaledSize(
  width: number,
  height: number,
  max = MAX_IMAGE_SIDE,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= max) return { width, height };
  const ratio = max / longest;
  return {
    width: Math.round(width * ratio),
    height: Math.round(height * ratio),
  };
}

/** Ruta en el bucket: `restorations/{id}/general/...` o `restorations/{id}/pieces/{id}/...`. */
export function filePath(
  restorationId: string,
  pieceId: string | null,
  fileId: string,
  type: FileMimeType,
): string {
  const folder = pieceId ? `pieces/${pieceId}` : "general";
  return `restorations/${restorationId}/${folder}/${fileId}.${FILE_TYPES[type]}`;
}

/** Agrupa por clasificación, en el orden Antes, Después, Documento, Otro (solo las que tienen archivos). */
export function groupByCategory<T extends { category: FileCategory }>(
  files: readonly T[],
): { category: FileCategory; files: T[] }[] {
  return FILE_CATEGORIES.map((category) => ({
    category,
    files: files.filter((f) => f.category === category),
  })).filter((g) => g.files.length > 0);
}

/** "1,2 MB", "350 KB". */
export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
