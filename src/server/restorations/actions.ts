"use server";

import { revalidatePath } from "next/cache";

import type { AppRole } from "@/lib/roles";
import type { TablesInsert } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import {
  depositAmountError,
  toCents,
  toDecimalString,
  toSoles,
} from "@/domain/money";
import { can } from "@/domain/permissions";
import {
  invalidInputMessage,
  pieceKeepingUrgencySchema,
  restorationEditSchema,
  restorationSchema,
  type PieceFormInput,
  type RestorationEditFormInput,
  type RestorationFormInput,
} from "@/lib/validation/restorations";
import { requirePermission } from "@/server/auth";
import {
  DEPOSIT_NOT_RECORDED,
  recordInitialDeposit,
} from "@/server/payments/initial-deposit";
import { scheduleShopifySync } from "@/server/shopify-sync/run";

import {
  createRestorationRecord,
  withoutSalePrices,
  withoutWorkshops,
} from "./create";

/** `warning`: se registró, pero el adelanto no (se registra después desde Pagos). */
export type CreateRestorationResult =
  { ok: true; id: string; code: string; warning?: string } | { error: string };

const ERRORS: Record<string, string> = {
  "23503":
    "El cliente, el contacto o un elemento elegido ya no existe o está desactivado.",
  "23514": "Revisa los datos de las piezas.",
  "42501": "No tienes permiso para registrar restauraciones.",
};

/**
 * Registra una restauración con sus piezas (todo o nada, RPC `create_restoration`).
 * Con adelanto ("A cuenta"), lo registra como pago con el método elegido.
 */
export async function createRestoration(
  input: RestorationFormInput,
): Promise<CreateRestorationResult> {
  const user = await requirePermission("restauraciones.editar");
  const parsed = restorationSchema.safeParse(input);
  if (!parsed.success) return { error: invalidInputMessage(parsed.error) };
  // El taller lo asignan logística y el admin (D60): ventas registra sin taller.
  let pieces = parsed.data.pieces;
  // La guía interna u observada no se cobra: sin precios (la BD también los ignora).
  const charged = parsed.data.kind === "normal";
  if (!charged || !can(user.role, "piezas.precio-venta"))
    pieces = withoutSalePrices(pieces);
  if (!can(user.role, "piezas.asignar-taller"))
    pieces = withoutWorkshops(pieces);
  const data = { ...parsed.data, pieces };

  const supabase = await createClient();
  let created;
  try {
    created = await createRestorationRecord(supabase, data);
  } catch (error) {
    const code = (error as { code?: string }).code ?? "";
    return { error: ERRORS[code] ?? "No se pudo registrar la restauración." };
  }
  revalidatePath("/restauraciones");
  const { depositAmount, depositMethodId } = parsed.data;
  if (
    charged &&
    depositAmount !== null &&
    depositAmount > 0 &&
    depositMethodId
  ) {
    // La restauración ya quedó: si el pago falla, se avisa y se registra desde Pagos.
    const recorded = await recordInitialDeposit(
      supabase,
      created.id,
      depositMethodId,
    );
    if (!recorded)
      return { ok: true, ...created, warning: DEPOSIT_NOT_RECORDED };
  }
  return { ok: true, ...created };
}

export type ContactChoice = { id: string; name: string; position: string };

/** Contactos activos de una empresa, para elegir quién deja las piezas. */
export async function listClientContacts(
  clientId: string,
): Promise<ContactChoice[]> {
  await requirePermission("restauraciones.editar");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contacts")
    .select("id, display_name, position")
    .eq("client_id", clientId)
    .eq("active", true)
    .order("display_name");
  if (error) throw error;
  return data.map((k) => ({
    id: k.id,
    name: k.display_name ?? "",
    position: k.position,
  }));
}

export type ActionResult = { ok: true } | { error: string };

/** Mensaje para el usuario: las reglas de la BD (23514) ya vienen en español. */
function editError(
  error: { code?: string; message?: string },
  fallback: string,
) {
  if (error.code === "23514" && error.message) return error.message;
  return ERRORS[error.code ?? ""] ?? fallback;
}

/** Edita contacto, tipo y adelanto, y notas generales (P12: no tocan Shopify). */
export async function updateRestoration(
  id: string,
  input: RestorationEditFormInput,
): Promise<ActionResult> {
  await requirePermission("restauraciones.editar");
  const parsed = restorationEditSchema.safeParse(input);
  if (!parsed.success) return { error: invalidInputMessage(parsed.error) };
  const v = parsed.data;

  const supabase = await createClient();
  // Una guía interna u observada no se cobra: su tipo de pago queda "Sin definir"
  // y sin adelanto (la BD lo exige).
  const current = await supabase
    .from("restorations")
    .select("total, kind")
    .eq("id", id)
    .maybeSingle();
  if (current.error) return { error: "No se pudo guardar la restauración." };
  if (!current.data) return { error: "La restauración no existe." };
  const charged = current.data.kind === "normal";
  const paymentType = charged ? v.paymentType : "sin_definir";
  const depositAmount = charged ? v.depositAmount : null;
  if (depositAmount !== null) {
    // El adelanto no puede superar el total ya asignado (sin precios, cualquier monto).
    const message = depositAmountError(
      depositAmount,
      toCents(Number(current.data.total)),
    );
    if (message) return { error: `${message}.` };
  }
  const { data, error } = await supabase
    .from("restorations")
    .update({
      contact_id: v.contactId,
      payment_type: paymentType,
      // El adelanto se guarda en soles; el % antiguo deja de usarse al editar.
      deposit_percent: null,
      deposit_amount: depositAmount === null ? null : toSoles(depositAmount),
      notes: v.notes,
    })
    .eq("id", id)
    .select("id");
  if (error)
    return { error: editError(error, "No se pudo guardar la restauración.") };
  if (data.length === 0) return { error: "La restauración no existe." };
  revalidatePath(`/restauraciones/${id}`);
  return { ok: true };
}

/**
 * Columnas de la pieza. El precio de venta solo lo escribe quien puede asignarlo
 * (admin, D58) y el taller, quien puede asignarlo (D60); para los demás no se envían
 * y quedan como están (o sin asignar).
 */
function pieceColumns(
  input: PieceFormInput,
  { withPrice, withWorkshop }: { withPrice: boolean; withWorkshop: boolean },
) {
  // No exige la fecha de entrega aquí: la BD la pide cuando la urgencia cambia y no
  // atasca la edición de una pieza urgente cerrada o entregada que no la tenía.
  const parsed = pieceKeepingUrgencySchema.safeParse(input);
  if (!parsed.success) return null;
  const p = parsed.data;
  return {
    piece: p,
    columns: {
      ...(withWorkshop && { workshop_id: p.workshopId }),
      quantity: p.quantity,
      description: p.description,
      measure: p.measure,
      // El primer material y los nombres los deriva la BD.
      material_ids: p.materials,
      // El primer servicio y los nombres los deriva la BD.
      service_ids: p.services,
      weight_grams: p.weightGrams,
      ...(withPrice && {
        price:
          p.priceCents === null ? null : Number(toDecimalString(p.priceCents)),
      }),
      notes: p.notes,
      urgent: p.urgent,
      // Obligatoria si es urgente; sin urgencia se borra (la BD lo exige).
      estimated_delivery_date: p.estimatedDeliveryDate,
      workshop_delivery_date: p.workshopDeliveryDate,
    },
  };
}

/** Qué columnas de la pieza escribe el rol (D58 y D60). */
const permissionsOf = (role: AppRole) => ({
  withPrice: can(role, "piezas.precio-venta"),
  withWorkshop: can(role, "piezas.asignar-taller"),
});

/** Edita una pieza; la BD bloquea lo que su estado o la orden de Shopify no permiten. */
export async function updatePiece(
  pieceId: string,
  input: PieceFormInput,
): Promise<ActionResult> {
  const user = await requirePermission("restauraciones.editar");
  const parsed = pieceColumns(input, permissionsOf(user.role));
  if (!parsed) return { error: "Revisa los datos de la pieza." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pieces")
    .update(parsed.columns)
    .eq("id", pieceId)
    .select("restoration_id");
  if (error) return { error: editError(error, "No se pudo guardar la pieza.") };
  if (data.length === 0) return { error: "La pieza no existe." };
  // Asignar el último precio de venta encola la orden de Shopify, o agrega la
  // pieza a la orden ya creada (D58).
  if ("price" in parsed.columns) scheduleShopifySync();
  revalidatePath(`/restauraciones/${data[0]!.restoration_id}`);
  return { ok: true };
}

/** Agrega una pieza a una restauración existente (llega a Shopify al aprobarse). */
export async function addPiece(
  restorationId: string,
  input: PieceFormInput,
): Promise<ActionResult> {
  const user = await requirePermission("restauraciones.editar");
  const parsed = pieceColumns(input, permissionsOf(user.role));
  if (!parsed) return { error: "Revisa los datos de la pieza." };

  const supabase = await createClient();
  // `number` y `code` los fija un trigger (los tipos generados los piden igual).
  const row = {
    restoration_id: restorationId,
    ...parsed.columns,
  } as TablesInsert<"pieces">;
  const { data, error } = await supabase
    .from("pieces")
    .insert(row)
    .select("id")
    .single();
  if (error) return { error: editError(error, "No se pudo agregar la pieza.") };
  // Sin precio pasa a Consulta, igual que al registrar la guía (la BD decide si aplica).
  const { error: consultError } = await supabase.rpc(
    "send_unpriced_to_consultation",
    { p_piece_ids: [data.id] },
  );
  revalidatePath(`/restauraciones/${restorationId}`);
  if (consultError)
    return {
      error: editError(
        consultError,
        "La pieza se agregó, pero no pasó a Consulta por no tener precio.",
      ),
    };
  return { ok: true };
}
