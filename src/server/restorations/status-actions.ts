"use server";

import { revalidatePath } from "next/cache";

import type { PieceStatus } from "@/domain/piece-state-machine";
import {
  isRestorationCloseTarget,
  planRestorationClosure,
  type RestorationCloseTarget,
} from "@/domain/restoration-closure";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/server/auth";
import { scheduleShopifySync } from "@/server/shopify-sync/run";

import { checkRequirements } from "./requirements";

export type StatusActionResult = { ok: true } | { error: string };

/** Refresca el detalle de la restauración (si hay una) y la vista de piezas. */
function refresh(restorationId: string | null) {
  if (restorationId) revalidatePath(`/restauraciones/${restorationId}`);
  revalidatePath("/piezas");
  revalidatePath("/piezas/[id]", "page");
}

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
  restorationId: string | null,
  pieceIds: string[],
  to: PieceStatus,
  note: string | null = null,
  workshopId: string | null = null,
): Promise<StatusActionResult> {
  await requirePermission("restauraciones.ver");
  if (pieceIds.length === 0) return { error: "Elige al menos una pieza." };
  const supabase = await createClient();
  const missing = await checkRequirements(supabase, to, pieceIds, workshopId);
  if (missing) return { error: missing };
  const { error } = await supabase.rpc("change_piece_status", {
    p_piece_ids: pieceIds,
    p_to: to,
    p_note: note ?? undefined,
    p_workshop_id: workshopId ?? undefined,
  });
  if (error) return fail(error, "No se pudo cambiar el estado.");
  // Aprobar la última pieza encola la orden (9.1); con la orden creada, anular o
  // aprobar una pieza agregada la edita (9.2) y entregar la prepara (9.3).
  scheduleShopifySync();
  refresh(restorationId);
  return { ok: true };
}

/**
 * Cambia el precio de una pieza con la orden de Shopify creada (Paso 9.2, P12): solo
 * admin, con motivo. La BD encola la edición de la orden.
 */
export async function changePiecePrice(
  restorationId: string,
  pieceId: string,
  priceCents: number,
  reason: string,
): Promise<StatusActionResult> {
  await requirePermission("restauraciones.editar");
  if (!reason.trim())
    return { error: "Escribe el motivo del cambio de precio." };
  if (!Number.isInteger(priceCents) || priceCents < 0)
    return { error: "Ingresa un precio válido." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("change_piece_price", {
    p_piece_id: pieceId,
    p_price: priceCents / 100,
    p_reason: reason,
  });
  if (error) return fail(error, "No se pudo cambiar el precio.");
  scheduleShopifySync();
  refresh(restorationId);
  return { ok: true };
}

/** "Marcar llegada a tienda" (todos los roles). */
export async function markPiecesArrived(
  restorationId: string | null,
  pieceIds: string[],
): Promise<StatusActionResult> {
  await requirePermission("piezas.marcar-llegada");
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_pieces_arrived", {
    p_piece_ids: pieceIds,
  });
  if (error) return fail(error, "No se pudo marcar la llegada.");
  refresh(restorationId);
  return { ok: true };
}

/** "Recibir del taller" (admin y logística): la pieza sigue en En restauración, ya en la tienda. */
export async function receiveFromWorkshop(
  restorationId: string | null,
  pieceIds: string[],
): Promise<StatusActionResult> {
  await requirePermission("piezas.enviar-recibir-taller");
  const supabase = await createClient();
  const missing = await checkRequirements(supabase, "recibir_taller", pieceIds);
  if (missing) return { error: missing };
  const { error } = await supabase.rpc("receive_from_workshop", {
    p_piece_ids: pieceIds,
  });
  if (error) return fail(error, "No se pudo recibir la pieza del taller.");
  refresh(restorationId);
  return { ok: true };
}

/** "Devolver al cliente": piezas rechazadas o sin arreglo que siguen en la tienda (P47). */
export async function returnPiecesToClient(
  restorationId: string | null,
  pieceIds: string[],
): Promise<StatusActionResult> {
  await requirePermission("piezas.marcar-llegada");
  const supabase = await createClient();
  const { error } = await supabase.rpc("return_pieces_to_client", {
    p_piece_ids: pieceIds,
  });
  if (error) return fail(error, "No se pudo registrar la devolución.");
  refresh(restorationId);
  return { ok: true };
}

/** Asigna o cambia el taller de las piezas (queda en la auditoría). */
export async function assignWorkshop(
  restorationId: string | null,
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
  refresh(restorationId);
  return { ok: true };
}

const dateOrNull = (value: string | null) => (value ? new Date(value) : null);

/**
 * Cierra la restauración a mano: Anulada o Rechazada (los demás estados se calculan
 * de las piezas). Anula o rechaza todas sus piezas vivas en una sola llamada a
 * `change_piece_status` (atómica: valida transición y rol de cada pieza) y el
 * trigger de la BD deriva el estado general. Si alguna pieza no puede cambiar, no
 * se toca ninguna.
 */
export async function closeRestoration(
  restorationId: string,
  to: RestorationCloseTarget,
  note: string,
): Promise<StatusActionResult> {
  const user = await requirePermission("piezas.consultar-aprobar-anular");
  if (!isRestorationCloseTarget(to))
    return {
      error: "La restauración solo se puede pasar a Anulada o Rechazada.",
    };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pieces_operational")
    .select(
      "id, code, status, arrived_at, workshop_id, first_sent_at, ready_for_delivery, returned_at, approved_at",
    )
    .eq("restoration_id", restorationId);
  if (error) return fail(error, "No se pudieron leer las piezas.");
  const plan = planRestorationClosure(
    data.map((p) => ({
      id: p.id!,
      code: p.code ?? "",
      status: p.status!,
      arrivedAt: dateOrNull(p.arrived_at),
      workshopId: p.workshop_id,
      firstSentAt: dateOrNull(p.first_sent_at),
      readyForDelivery: p.ready_for_delivery ?? false,
      returnedAt: dateOrNull(p.returned_at),
      approvedAt: dateOrNull(p.approved_at),
    })),
    to,
    user.role,
    { note },
  );
  if (!plan.ok) return { error: plan.error };
  return changePieceStatus(restorationId, plan.pieceIds, to, note.trim());
}
