import "server-only";

import { filePath, type FileMimeType } from "@/domain/files";
import type { createClient } from "@/lib/supabase/server";

import { FILES_BUCKET } from "./queries";

export const PHOTOS_NOT_COPIED =
  "No se pudieron copiar algunas fotos de la cotización: súbelas desde Archivos.";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Copia las fotos y archivos de la cotización de WhatsApp a la restauración recién
 * creada desde ella: las generales quedan generales y las de cada pieza cotizada van
 * a la pieza que se creó desde ella (las de piezas que no se pidieron en esta guía no
 * se copian). La cotización conserva las suyas. Devuelve cuántas no se pudieron copiar.
 */
export async function copyQuoteFilesToRestoration(
  supabase: Supabase,
  quoteId: string,
  restorationId: string,
): Promise<number> {
  const [files, pieces] = await Promise.all([
    supabase
      .from("whatsapp_quote_files")
      .select("item_id, path, name, mime_type, size_bytes, category")
      .eq("quote_id", quoteId)
      .order("created_at"),
    supabase
      .from("pieces")
      .select("id, whatsapp_quote_item_id")
      .eq("restoration_id", restorationId),
  ]);
  if (files.error || pieces.error) return files.data?.length ?? 1;

  const pieceOf = new Map(
    pieces.data.flatMap((p) =>
      p.whatsapp_quote_item_id
        ? [[p.whatsapp_quote_item_id, p.id] as const]
        : [],
    ),
  );
  const storage = supabase.storage.from(FILES_BUCKET);
  let failed = 0;
  for (const file of files.data) {
    const pieceId = file.item_id ? pieceOf.get(file.item_id) : null;
    if (pieceId === undefined) continue;
    const path = filePath(
      restorationId,
      pieceId,
      crypto.randomUUID(),
      file.mime_type as FileMimeType,
    );
    const { error: copyError } = await storage.copy(file.path, path);
    if (copyError) {
      failed += 1;
      continue;
    }
    const { error } = await supabase.from("restoration_files").insert({
      restoration_id: restorationId,
      piece_id: pieceId,
      path,
      name: file.name,
      mime_type: file.mime_type,
      size_bytes: file.size_bytes,
      category: file.category,
    });
    if (error) {
      // Sin registro, la copia no sirve: se borra.
      await storage.remove([path]);
      failed += 1;
    }
  }
  return failed;
}
