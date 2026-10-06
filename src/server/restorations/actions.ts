"use server";

import { revalidatePath } from "next/cache";

import type { TablesInsert } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { toDecimalString } from "@/domain/money";
import {
  pieceSchema,
  restorationEditSchema,
  restorationSchema,
  type PieceFormInput,
  type RestorationEditFormInput,
  type RestorationFormInput,
} from "@/lib/validation/restorations";
import { requirePermission } from "@/server/auth";

import { createRestorationRecord } from "./create";

export type CreateRestorationResult =
  { ok: true; id: string; code: string } | { error: string };

const ERRORS: Record<string, string> = {
  "23503":
    "El cliente, el contacto o un elemento elegido ya no existe o está desactivado.",
  "23514": "Revisa los datos de las piezas.",
  "42501": "No tienes permiso para registrar restauraciones.",
};

/** Registra una restauración con sus piezas (todo o nada, RPC `create_restoration`). */
export async function createRestoration(
  input: RestorationFormInput,
): Promise<CreateRestorationResult> {
  await requirePermission("restauraciones.editar");
  const parsed = restorationSchema.safeParse(input);
  if (!parsed.success) return { error: "Revisa los datos ingresados." };

  try {
    const created = await createRestorationRecord(
      await createClient(),
      parsed.data,
    );
    revalidatePath("/restauraciones");
    return { ok: true, ...created };
  } catch (error) {
    const code = (error as { code?: string }).code ?? "";
    return { error: ERRORS[code] ?? "No se pudo registrar la restauración." };
  }
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

/** Edita contacto, tipo y % de adelanto y notas (P12: no tocan Shopify). */
export async function updateRestoration(
  id: string,
  input: RestorationEditFormInput,
): Promise<ActionResult> {
  await requirePermission("restauraciones.editar");
  const parsed = restorationEditSchema.safeParse(input);
  if (!parsed.success) return { error: "Revisa los datos ingresados." };
  const v = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("restorations")
    .update({
      contact_id: v.contactId,
      payment_type: v.paymentType,
      deposit_percent: v.depositPercent,
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

function pieceColumns(input: PieceFormInput) {
  const parsed = pieceSchema.safeParse(input);
  if (!parsed.success) return null;
  const p = parsed.data;
  return {
    piece: p,
    columns: {
      workshop_id: p.workshopId,
      description: p.description,
      measure: p.measure,
      material_id: p.material?.id ?? null,
      material_name: p.material?.name ?? "",
      service_id: p.service?.id ?? null,
      service_name: p.service?.name ?? "",
      weight_grams: p.weightGrams,
      price: Number(toDecimalString(p.priceCents)),
      notes: p.notes,
      urgent: p.urgent,
    },
  };
}

/** Edita una pieza; la BD bloquea lo que su estado o la orden de Shopify no permiten. */
export async function updatePiece(
  pieceId: string,
  input: PieceFormInput,
): Promise<ActionResult> {
  await requirePermission("restauraciones.editar");
  const parsed = pieceColumns(input);
  if (!parsed) return { error: "Revisa los datos de la pieza." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pieces")
    .update(parsed.columns)
    .eq("id", pieceId)
    .select("restoration_id");
  if (error) return { error: editError(error, "No se pudo guardar la pieza.") };
  if (data.length === 0) return { error: "La pieza no existe." };
  revalidatePath(`/restauraciones/${data[0]!.restoration_id}`);
  return { ok: true };
}

/** Agrega una pieza a una restauración existente (llega a Shopify al aprobarse). */
export async function addPiece(
  restorationId: string,
  input: PieceFormInput,
): Promise<ActionResult> {
  await requirePermission("restauraciones.editar");
  const parsed = pieceColumns(input);
  if (!parsed) return { error: "Revisa los datos de la pieza." };

  const supabase = await createClient();
  // `number` y `code` los fija un trigger (los tipos generados los piden igual).
  const row = {
    restoration_id: restorationId,
    ...parsed.columns,
    arrived_at: parsed.piece.arrived ? new Date().toISOString() : null,
  } as TablesInsert<"pieces">;
  const { error } = await supabase.from("pieces").insert(row);
  if (error) return { error: editError(error, "No se pudo agregar la pieza.") };
  revalidatePath(`/restauraciones/${restorationId}`);
  return { ok: true };
}
