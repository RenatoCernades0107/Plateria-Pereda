"use server";

import { revalidatePath } from "next/cache";

import {
  DELIVERY_DATE_INVALID,
  DELIVERY_DATE_REQUIRED,
  isIsoDate,
  WORKSHOP_DATE_AFTER_CLIENT,
} from "@/domain/delivery-date";
import { can } from "@/domain/permissions";
import { toPieceStatus, type PieceStatus } from "@/domain/piece-state-machine";
import {
  isRestorationCloseTarget,
  planRestorationClosure,
  type RestorationCloseTarget,
} from "@/domain/restoration-closure";
import {
  RESTORATION_KINDS,
  type RestorationKind,
} from "@/domain/restoration-status";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/server/auth";
import { scheduleShopifySync } from "@/server/shopify-sync/run";

import { checkRequirements } from "./requirements";

export type StatusActionResult = { ok: true } | { error: string };

/**
 * Resultado de mover piezas (estado o ubicación): si el movimiento se puede deshacer,
 * trae los eventos del historial que `undoPieceMove` revierte ("Deshacer" en el aviso
 * del kanban). Sin `undoIds` no se ofrece: lo hizo otro, pasó algo después, o el
 * movimiento tocó la orden de Shopify o un pago.
 */
export type MoveActionResult =
  { ok: true; undoIds?: number[] } | { error: string };

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Eventos para "Deshacer" el movimiento recién hecho (nada si no se puede). */
async function undoable(
  supabase: Supabase,
  pieceIds: string[],
): Promise<MoveActionResult> {
  const { data, error } = await supabase.rpc("piece_move_undo_ids", {
    p_piece_ids: pieceIds,
  });
  if (error || !data || data.length === 0) return { ok: true };
  return { ok: true, undoIds: data };
}

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
): Promise<MoveActionResult> {
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
  return undoable(supabase, pieceIds);
}

/**
 * "Retroceder estado": la pieza vuelve al estado anterior de su historial (RPC
 * `undo_piece_status`, que valida el rol con la transición original). El motivo es
 * obligatorio y el retroceso queda en la línea de tiempo.
 */
export async function undoPieceStatus(
  restorationId: string,
  pieceId: string,
  reason: string,
): Promise<StatusActionResult> {
  await requirePermission("restauraciones.ver");
  if (!reason.trim()) return { error: "Escribe el motivo del retroceso." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("undo_piece_status", {
    p_piece_id: pieceId,
    p_note: reason,
  });
  if (error) return fail(error, "No se pudo retroceder el estado.");
  // Reactivar o desaprobar una pieza edita la orden de Shopify (9.2).
  scheduleShopifySync();
  refresh(restorationId);
  return { ok: true };
}

/**
 * Cambia el precio de una pieza con la orden de Shopify creada (Paso 9.2, P12): admin,
 * logística (2026-10-19) y ventas (2026-10-21), con motivo. La BD encola la edición de la orden.
 */
export async function changePiecePrice(
  restorationId: string,
  pieceId: string,
  priceCents: number,
  reason: string,
): Promise<StatusActionResult> {
  await requirePermission("piezas.precio-venta");
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

/**
 * Marca o quita "Urgente" a una o varias piezas (admin, ventas y logística; RPC
 * `set_pieces_urgent`). Al marcar hay que indicar la fecha estimada de entrega al
 * cliente (AAAA-MM-DD); la del taller es opcional y no puede ser posterior a la del
 * cliente. Si no se indica la del taller, queda 3 días antes de la del cliente (la BD).
 * Llamarla sobre piezas que ya son urgentes coloca o cambia las fechas: con la del taller
 * en blanco la borra, salvo `keepWorkshopDate` (cambio en bloque: cada pieza conserva la
 * suya). La fecha del taller solo la cambian logística y el admin: para ventas se ignora
 * y siempre se conserva. Las piezas pueden ser de varias guías: se refrescan todas.
 */
export async function setPiecesUrgent(
  pieceIds: string[],
  urgent: boolean,
  estimatedDeliveryDate: string | null = null,
  options: {
    workshopDeliveryDate?: string | null;
    keepWorkshopDate?: boolean;
  } = {},
): Promise<StatusActionResult> {
  const user = await requirePermission("piezas.marcar-urgente");
  if (pieceIds.length === 0) return { error: "Elige al menos una pieza." };
  const canSetWorkshopDate = can(user.role, "piezas.asignar-taller");
  const workshopDeliveryDate = canSetWorkshopDate
    ? (options.workshopDeliveryDate ?? null)
    : null;
  const keepWorkshopDate = canSetWorkshopDate
    ? (options.keepWorkshopDate ?? false)
    : true;
  if (urgent) {
    if (!estimatedDeliveryDate) return { error: `${DELIVERY_DATE_REQUIRED}.` };
    if (!isIsoDate(estimatedDeliveryDate))
      return { error: `${DELIVERY_DATE_INVALID}.` };
    if (workshopDeliveryDate) {
      if (!isIsoDate(workshopDeliveryDate))
        return { error: `${DELIVERY_DATE_INVALID}.` };
      if (workshopDeliveryDate > estimatedDeliveryDate)
        return { error: `${WORKSHOP_DATE_AFTER_CLIENT}.` };
    }
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_pieces_urgent", {
    p_piece_ids: pieceIds,
    p_urgent: urgent,
    ...(urgent && estimatedDeliveryDate
      ? {
          p_estimated_delivery_date: estimatedDeliveryDate,
          ...(workshopDeliveryDate
            ? { p_workshop_delivery_date: workshopDeliveryDate }
            : {}),
          ...(keepWorkshopDate ? { p_keep_workshop_date: true } : {}),
        }
      : {}),
  });
  if (error)
    return fail(
      error,
      urgent
        ? "No se pudo marcar la pieza como urgente."
        : "No se pudo quitar la marca de urgente.",
    );
  revalidatePath("/restauraciones/[id]", "page");
  refresh(null);
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

/**
 * "Enviar al taller" (admin y logística): piezas Aprobadas u Observadas que están en la
 * tienda van al taller elegido (o al que ya tienen) sin cambiar de estado (RPC
 * `send_pieces_to_workshop`).
 */
export async function sendPiecesToWorkshop(
  pieceIds: string[],
  workshopId: string | null,
): Promise<MoveActionResult> {
  await requirePermission("piezas.enviar-recibir-taller");
  if (pieceIds.length === 0) return { error: "Elige al menos una pieza." };
  const supabase = await createClient();
  const missing = await checkRequirements(
    supabase,
    "enviar_taller",
    pieceIds,
    workshopId,
  );
  if (missing) return { error: missing };
  const { error } = await supabase.rpc("send_pieces_to_workshop", {
    p_piece_ids: pieceIds,
    p_workshop_id: workshopId ?? undefined,
  });
  if (error) return fail(error, "No se pudo enviar la pieza al taller.");
  // El estado general puede cambiar (p. ej. una pieza lista vuelve al taller).
  scheduleShopifySync();
  // Las piezas pueden ser de varias guías: se refrescan todos los detalles.
  revalidatePath("/restauraciones/[id]", "page");
  refresh(null);
  return undoable(supabase, pieceIds);
}

/** "Recibir del taller" (admin y logística): la pieza vuelve a la tienda, mismo estado. */
export async function receiveFromWorkshop(
  restorationId: string | null,
  pieceIds: string[],
): Promise<MoveActionResult> {
  await requirePermission("piezas.enviar-recibir-taller");
  const supabase = await createClient();
  const missing = await checkRequirements(supabase, "recibir_taller", pieceIds);
  if (missing) return { error: missing };
  const { error } = await supabase.rpc("receive_from_workshop", {
    p_piece_ids: pieceIds,
  });
  if (error) return fail(error, "No se pudo recibir la pieza del taller.");
  refresh(restorationId);
  return undoable(supabase, pieceIds);
}

/**
 * "Llevar al taller a revisar" (admin y logística): piezas en Consulta o esperando la
 * respuesta del cliente van al taller elegido sin cambiar de estado (revisión en taller).
 */
export async function sendPiecesForReview(
  restorationId: string | null,
  pieceIds: string[],
  workshopId: string | null,
): Promise<MoveActionResult> {
  await requirePermission("piezas.enviar-recibir-taller");
  if (pieceIds.length === 0) return { error: "Elige al menos una pieza." };
  if (!workshopId)
    return { error: "Elige el taller al que se lleva la pieza." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("send_pieces_for_review", {
    p_piece_ids: pieceIds,
    p_workshop_id: workshopId,
  });
  if (error) return fail(error, "No se pudo llevar la pieza al taller.");
  refresh(restorationId);
  return undoable(supabase, pieceIds);
}

/** "Volvió de revisión" (admin y logística): la pieza vuelve a la tienda, mismo estado. */
export async function receivePiecesFromReview(
  restorationId: string | null,
  pieceIds: string[],
): Promise<MoveActionResult> {
  await requirePermission("piezas.enviar-recibir-taller");
  if (pieceIds.length === 0) return { error: "Elige al menos una pieza." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("receive_pieces_from_review", {
    p_piece_ids: pieceIds,
  });
  if (error)
    return fail(error, "No se pudo registrar la vuelta de la revisión.");
  refresh(restorationId);
  return undoable(supabase, pieceIds);
}

/**
 * "Deshacer" del aviso tras mover piezas en el kanban (RPC `undo_piece_move`): las
 * piezas vuelven exactamente a como estaban y los eventos del movimiento salen del
 * historial. La BD exige que lo haga quien movió, dentro de 2 minutos y sin nada
 * después; las piezas pueden ser de varias guías, así que se refrescan todas.
 */
export async function undoPieceMove(
  restorationId: string | null,
  historyIds: number[],
): Promise<StatusActionResult> {
  await requirePermission("restauraciones.ver");
  if (historyIds.length === 0)
    return { error: "No hay ningún movimiento que deshacer." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("undo_piece_move", {
    p_history_ids: historyIds,
  });
  if (error) return fail(error, "No se pudo deshacer el movimiento.");
  revalidatePath("/restauraciones/[id]", "page");
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

/**
 * Cambia el tipo de guía (admin y ventas; RPC `set_restoration_kind`): la BD revisa
 * que no tenga orden de Shopify, pagos ni piezas que hayan ido al taller o se hayan
 * entregado, y ajusta estados, precios y tipo de pago.
 */
export async function setRestorationKind(
  restorationId: string,
  kind: RestorationKind,
): Promise<StatusActionResult> {
  await requirePermission("restauraciones.editar");
  if (!RESTORATION_KINDS.includes(kind))
    return { error: "Elige el tipo de guía." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_restoration_kind", {
    p_restoration_id: restorationId,
    p_kind: kind,
  });
  if (error) return fail(error, "No se pudo cambiar el tipo de guía.");
  refresh(restorationId);
  revalidatePath("/restauraciones");
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
      "id, code, status, arrived_at, workshop_id, first_sent_at, last_sent_at, last_returned_at, observed_at, ready_for_delivery, returned_at, approved_at, review_sent_at, review_returned_at",
    )
    .eq("restoration_id", restorationId);
  if (error) return fail(error, "No se pudieron leer las piezas.");
  const plan = planRestorationClosure(
    data.map((p) => ({
      id: p.id!,
      code: p.code ?? "",
      status: toPieceStatus(p.status!),
      arrivedAt: dateOrNull(p.arrived_at),
      workshopId: p.workshop_id,
      firstSentAt: dateOrNull(p.first_sent_at),
      readyForDelivery: p.ready_for_delivery ?? false,
      returnedAt: dateOrNull(p.returned_at),
      approvedAt: dateOrNull(p.approved_at),
      reviewSentAt: dateOrNull(p.review_sent_at),
      reviewReturnedAt: dateOrNull(p.review_returned_at),
      lastSentAt: dateOrNull(p.last_sent_at),
      lastReturnedAt: dateOrNull(p.last_returned_at),
      observedAt: dateOrNull(p.observed_at),
    })),
    to,
    user.role,
    { note },
  );
  if (!plan.ok) return { error: plan.error };
  return changePieceStatus(restorationId, plan.pieceIds, to, note.trim());
}
