"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  FILE_CATEGORIES,
  FILE_TYPES,
  filePath,
  MAX_FILE_BYTES,
  quoteFilePath,
  type FileMimeType,
} from "@/domain/files";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/server/auth";

import { FILES_BUCKET } from "./queries";

export type FileActionResult = { ok: true } | { error: string };

/**
 * Refresca las vistas que muestran archivos: la guía, el detalle de la pieza (si el
 * archivo es de una pieza) y el tablero de piezas (su miniatura "Antes").
 */
function revalidateFileViews(restorationId: string, pieceId: string | null) {
  revalidatePath(`/restauraciones/${restorationId}`);
  if (pieceId) revalidatePath(`/piezas/${pieceId}`);
  revalidatePath("/piezas");
}

const fileSchema = z
  .object({
    restorationId: z.guid(),
    pieceId: z.guid().nullable(),
    fileId: z.guid(),
    name: z.string().trim().min(1).max(255),
    mimeType: z.enum(
      Object.keys(FILE_TYPES) as [FileMimeType, ...FileMimeType[]],
    ),
    sizeBytes: z.number().int().positive().max(MAX_FILE_BYTES),
    category: z.enum(FILE_CATEGORIES),
  })
  .transform((v) => ({
    ...v,
    path: filePath(v.restorationId, v.pieceId, v.fileId, v.mimeType),
  }));

export type RegisterFileInput = z.input<typeof fileSchema>;

/**
 * Registra un archivo ya subido al bucket (Fase 10). La ruta se arma aquí con los
 * mismos datos que usó el navegador, así no se puede registrar un objeto ajeno.
 */
export async function registerRestorationFile(
  input: RegisterFileInput,
): Promise<FileActionResult> {
  await requirePermission("fotos.subir");
  const parsed = fileSchema.safeParse(input);
  if (!parsed.success) return { error: "El archivo no es válido." };
  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("restoration_files").insert({
    restoration_id: v.restorationId,
    piece_id: v.pieceId,
    path: v.path,
    name: v.name,
    mime_type: v.mimeType,
    size_bytes: v.sizeBytes,
    category: v.category,
  });
  if (error) {
    // Sin registro, el objeto no sirve: se borra (quien lo subió puede hacerlo).
    await supabase.storage.from(FILES_BUCKET).remove([v.path]);
    return { error: "No se pudo registrar el archivo." };
  }
  revalidateFileViews(v.restorationId, v.pieceId);
  return { ok: true };
}

/** Borra un archivo: solo el admin o quien lo subió (lo exige la RLS, P32). */
export async function deleteRestorationFile(
  fileId: string,
): Promise<FileActionResult> {
  await requirePermission("fotos.subir");
  const supabase = await createClient();
  const { data: file, error } = await supabase
    .from("restoration_files")
    .select("id, path, restoration_id, piece_id")
    .eq("id", fileId)
    .maybeSingle();
  if (error || !file) return { error: "El archivo ya no existe." };

  const { data: removed, error: removeError } = await supabase.storage
    .from(FILES_BUCKET)
    .remove([file.path]);
  if (removeError || !removed?.length)
    return { error: "No tienes permiso para borrar este archivo." };
  const { error: deleteError } = await supabase
    .from("restoration_files")
    .delete()
    .eq("id", fileId);
  if (deleteError) return { error: "No se pudo borrar el archivo." };
  revalidateFileViews(file.restoration_id, file.piece_id);
  return { ok: true };
}

const quoteFileSchema = z
  .object({
    quoteId: z.guid(),
    itemId: z.guid().nullable(),
    fileId: z.guid(),
    name: z.string().trim().min(1).max(255),
    mimeType: z.enum(
      Object.keys(FILE_TYPES) as [FileMimeType, ...FileMimeType[]],
    ),
    sizeBytes: z.number().int().positive().max(MAX_FILE_BYTES),
    category: z.enum(FILE_CATEGORIES),
  })
  .transform((v) => ({
    ...v,
    path: quoteFilePath(v.quoteId, v.itemId, v.fileId, v.mimeType),
  }));

export type RegisterQuoteFileInput = z.input<typeof quoteFileSchema>;

/** Registra un archivo de una cotización de WhatsApp ya subido al bucket. */
export async function registerWhatsappQuoteFile(
  input: RegisterQuoteFileInput,
): Promise<FileActionResult> {
  await requirePermission("cotizaciones-whatsapp.usar");
  const parsed = quoteFileSchema.safeParse(input);
  if (!parsed.success) return { error: "El archivo no es válido." };
  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("whatsapp_quote_files").insert({
    quote_id: v.quoteId,
    item_id: v.itemId,
    path: v.path,
    name: v.name,
    mime_type: v.mimeType,
    size_bytes: v.sizeBytes,
    category: v.category,
  });
  if (error) {
    await supabase.storage.from(FILES_BUCKET).remove([v.path]);
    return { error: "No se pudo registrar el archivo." };
  }
  revalidatePath(`/cotizaciones-whatsapp/${v.quoteId}`);
  return { ok: true };
}

/** Borra un archivo de una cotización: solo el admin o quien lo subió (RLS). */
export async function deleteWhatsappQuoteFile(
  fileId: string,
): Promise<FileActionResult> {
  await requirePermission("cotizaciones-whatsapp.usar");
  const supabase = await createClient();
  const { data: file, error } = await supabase
    .from("whatsapp_quote_files")
    .select("id, path, quote_id")
    .eq("id", fileId)
    .maybeSingle();
  if (error || !file) return { error: "El archivo ya no existe." };

  const { data: removed, error: removeError } = await supabase.storage
    .from(FILES_BUCKET)
    .remove([file.path]);
  if (removeError || !removed?.length)
    return { error: "No tienes permiso para borrar este archivo." };
  const { error: deleteError } = await supabase
    .from("whatsapp_quote_files")
    .delete()
    .eq("id", fileId);
  if (deleteError) return { error: "No se pudo borrar el archivo." };
  revalidatePath(`/cotizaciones-whatsapp/${file.quote_id}`);
  return { ok: true };
}
