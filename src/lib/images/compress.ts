import { isCompressible, scaledSize } from "@/domain/files";

/** Fotos más livianas que esto y sin reducir se suben tal cual. */
const SMALL_ENOUGH = 1.5 * 1024 * 1024;

/**
 * Comprime una foto en el navegador antes de subirla (P32): lado mayor de 1920 px,
 * JPG (o WebP si era PNG o WebP, para conservar la transparencia) al 85 %. Los PDF,
 * los HEIC y lo que el navegador no pueda leer se suben sin cambios; si la versión
 * comprimida pesa más que la original, se sube la original.
 */
export async function compressImage(file: File): Promise<File> {
  if (!isCompressible(file.type) || typeof createImageBitmap !== "function")
    return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }
  const size = scaledSize(bitmap.width, bitmap.height);
  if (size.width === bitmap.width && file.size <= SMALL_ENOUGH) {
    bitmap.close();
    return file;
  }
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close();
  const type = file.type === "image/jpeg" ? "image/jpeg" : "image/webp";
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, type, 0.85),
  );
  if (!blob || blob.size >= file.size) return file;
  const name =
    file.name.replace(/\.[^.]+$/, "") +
    (type === "image/jpeg" ? ".jpg" : ".webp");
  return new File([blob], name, { type, lastModified: file.lastModified });
}
