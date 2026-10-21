import "server-only";

import type { FileCategory } from "@/domain/files";
import { createClient } from "@/lib/supabase/server";

export const FILES_BUCKET = "restoration-files";

/** Las URLs firmadas duran una hora (P32: de corta duración). */
const URL_SECONDS = 60 * 60;

export type RestorationFile = {
  id: string;
  /** De quién es; sin dato, de una restauración. */
  owner?: "restoration" | "whatsappQuote";
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

type FileRow = {
  id: string;
  piece_id: string | null;
  path: string;
  name: string;
  mime_type: string;
  size_bytes: number;
  category: FileCategory;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
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
  return withSignedUrls(data, "restoration");
}

/**
 * Archivos de la cotización de WhatsApp (admin y ventas), con URLs firmadas; en el
 * mismo formato que los de las restauraciones (`pieceId` es la pieza cotizada).
 */
export async function listWhatsappQuoteFiles(
  quoteId: string,
): Promise<RestorationFile[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("whatsapp_quote_files")
    .select(
      "id, item_id, path, name, mime_type, size_bytes, category, created_by, created_by_name, created_at",
    )
    .eq("quote_id", quoteId)
    .order("created_at");
  if (error) throw error;
  return withSignedUrls(
    data.map(({ item_id, ...f }) => ({ ...f, piece_id: item_id })),
    "whatsappQuote",
  );
}

async function withSignedUrls(
  data: FileRow[],
  owner: NonNullable<RestorationFile["owner"]>,
): Promise<RestorationFile[]> {
  if (data.length === 0) return [];
  const supabase = await createClient();

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
    owner,
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

/** URLs firmadas para ver fotos (p. ej. la foto "Antes" de cada pieza en la tabla). */
export async function signedPhotoUrls(
  paths: string[],
): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map();
  const supabase = await createClient();
  const { data } = await supabase.storage
    .from(FILES_BUCKET)
    .createSignedUrls(paths, URL_SECONDS);
  return new Map(
    (data ?? []).flatMap((s) =>
      s.path && s.signedUrl ? [[s.path, s.signedUrl] as const] : [],
    ),
  );
}
