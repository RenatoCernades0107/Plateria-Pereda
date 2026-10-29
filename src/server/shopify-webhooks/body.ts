/**
 * Los webhooks de Shopify pesan unos KB (una orden grande, decenas). Se corta en 1 MB
 * para que nadie pueda llenar la memoria del servidor con un cuerpo enorme: la firma
 * se verifica recién con el cuerpo completo.
 */
export const MAX_WEBHOOK_BYTES = 1024 * 1024;

/** Lee el cuerpo como texto; `null` si supera el límite (sin leer el resto). */
export async function readBodyWithLimit(
  request: Request,
  maxBytes = MAX_WEBHOOK_BYTES,
): Promise<string | null> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
