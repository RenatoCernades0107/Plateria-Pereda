"use server";

import { revalidatePath } from "next/cache";

import type { PieceStatus } from "@/domain/piece-state-machine";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/server/auth";

export type StatusActionResult = { ok: true } | { error: string };

/** Las reglas de la BD ya traen mensajes en español para estos códigos. */
const READABLE = new Set(["23514", "42501", "23503", "22023"]);

function fail(
  error: { code?: string; message?: string },
  fallback: string,
): StatusActionResult {
  return {
    error:
      READABLE.has(error.code ?? "") && error.message
        ? error.message
        : fallback,
  };
}

/**
 * Cambia el estado de una o varias piezas (RPC `change_piece_status`, que valida
 * transición, rol, nota y taller con la tabla de transiciones).
 */
export async function changePieceStatus(
  restorationId: string,
  pieceIds: string[],
  to: PieceStatus,
  note: string | null = null,
  workshopId: string | null = null,
): Promise<StatusActionResult> {
  await requirePermission("restauraciones.ver");
  if (pieceIds.length === 0) return { error: "Elige al menos una pieza." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("change_piece_status", {
    p_piece_ids: pieceIds,
    p_to: to,
    p_note: note ?? undefined,
    p_workshop_id: workshopId ?? undefined,
  });
  if (error) return fail(error, "No se pudo cambiar el estado.");
  revalidatePath(`/restauraciones/${restorationId}`);
  return { ok: true };
}

/** "Marcar llegada a tienda" (todos los roles). */
export async function markPiecesArrived(
  restorationId: string,
  pieceIds: string[],
): Promise<StatusActionResult> {
  await requirePermission("piezas.marcar-llegada");
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_pieces_arrived", {
    p_piece_ids: pieceIds,
  });
  if (error) return fail(error, "No se pudo marcar la llegada.");
  revalidatePath(`/restauraciones/${restorationId}`);
  return { ok: true };
}

/** Asigna o cambia el taller de las piezas (queda en la auditoría). */
export async function assignWorkshop(
  restorationId: string,
  pieceIds: string[],
  workshopId: string | null,
): Promise<StatusActionResult> {
  await requirePermission("piezas.asignar-taller");
  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_piece_workshop", {
    p_piece_ids: pieceIds,
    p_workshop_id: workshopId as string,
  });
  if (error) return fail(error, "No se pudo asignar el taller.");
  revalidatePath(`/restauraciones/${restorationId}`);
  return { ok: true };
}
