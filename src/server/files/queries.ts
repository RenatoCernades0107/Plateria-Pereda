import "server-only";

import type { FileCategory } from "@/domain/files";
import { createClient } from "@/lib/supabase/server";

export const FILES_BUCKET = "restoration-files";

/** Las URLs firmadas duran una hora (P32: de corta duración). */
const URL_SECONDS = 60 * 60;

export type RestorationFile = {
  id: string;
  pieceId: string | null;
  name: string;
  mimeType: string;
  sizeBytes: number;
  category: FileCategory;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
  /** Para verla en la galería. */
  url: string | null;
  /** Para descargarla con su nombre. */
  downloadUrl: string | null;
};

/** Archivos de la restauración (la RLS limita a quien la ve), con URLs firmadas. */
export async function listRestorationFiles(
  restorationId: string,
): Promise<RestorationFile[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("restoration_files")
    .select(
      "id, piece_id, path, name, mime_type, size_bytes, category, created_by, created_by_name, created_at",
    )
    .eq("restoration_id", restorationId)
    .order("created_at");
  if (error) throw error;
  if (data.length === 0) return [];

  const storage = supabase.storage.from(FILES_BUCKET);
  const paths = data.map((f) => f.path);
  const [view, download] = await Promise.all([
    storage.createSignedUrls(paths, URL_SECONDS),
    Promise.all(
      data.map((f) =>
        storage.createSignedUrl(f.path, URL_SECONDS, { download: f.name }),
      ),
    ),
  ]);
  const viewUrl = new Map(
    (view.data ?? []).map((s) => [s.path, s.signedUrl || null]),
  );

  return data.map((f, i) => ({
    id: f.id,
    pieceId: f.piece_id,
    name: f.name,
    mimeType: f.mime_type,
    sizeBytes: f.size_bytes,
    category: f.category,
    createdBy: f.created_by,
    createdByName: f.created_by_name,
    createdAt: f.created_at,
    url: viewUrl.get(f.path) ?? null,
    downloadUrl: download[i]?.data?.signedUrl ?? null,
  }));
}
