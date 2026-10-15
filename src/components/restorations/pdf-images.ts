/** Logo de Pereda (en `public/`) para el encabezado de los PDF. */
export const PDF_LOGO_URL = "/logo-pereda.png";

/** Miniaturas JPEG (máx. 240 px) de las fotos; las que no se puedan bajar se omiten. */
export async function loadPhotos(
  pieces: readonly { id: string }[],
  photos: Record<string, string>,
): Promise<Map<string, string>> {
  const images = new Map<string, string>();
  await Promise.all(
    pieces.map(async (p) => {
      const url = photos[p.id];
      if (!url) return;
      try {
        images.set(p.id, await thumbnail(url, 240));
      } catch {
        // Sin la foto, la pieza sale igual (con "Sin foto").
      }
    }),
  );
  return images;
}

export async function thumbnail(url: string, max: number): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const bitmap = await createImageBitmap(await res.blob());
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Sin canvas");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.85);
}
