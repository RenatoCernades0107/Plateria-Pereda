"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { workshopSchema, type WorkshopInput } from "@/lib/validation/workshops";
import { requirePermission } from "@/server/auth";

export type WorkshopActionResult = { ok: true } | { error: string };

const DUPLICATE = "Ya existe un taller con ese nombre.";

function toRow(input: WorkshopInput) {
  return {
    name: input.name,
    contact_name: input.contactName,
    phone: input.phone,
    address: input.address,
    notes: input.notes,
  };
}

export async function createWorkshop(
  input: WorkshopInput,
): Promise<WorkshopActionResult> {
  await requirePermission("talleres.gestionar");
  const parsed = workshopSchema.safeParse(input);
  if (!parsed.success) return { error: "Revisa los datos ingresados." };

  const supabase = await createClient();
  const { error } = await supabase.from("workshops").insert(toRow(parsed.data));
  if (error) {
    return {
      error: error.code === "23505" ? DUPLICATE : "No se pudo crear el taller.",
    };
  }
  revalidatePath("/talleres");
  return { ok: true };
}

export async function updateWorkshop(
  id: string,
  input: WorkshopInput,
): Promise<WorkshopActionResult> {
  await requirePermission("talleres.gestionar");
  const parsed = workshopSchema.safeParse(input);
  if (!parsed.success) return { error: "Revisa los datos ingresados." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("workshops")
    .update(toRow(parsed.data))
    .eq("id", id);
  if (error) {
    return {
      error:
        error.code === "23505" ? DUPLICATE : "No se pudo guardar el taller.",
    };
  }
  revalidatePath("/talleres");
  return { ok: true };
}

/** Un taller en uso no se borra: se desactiva para conservar el historial de sus piezas. */
export async function setWorkshopActive(
  id: string,
  active: boolean,
): Promise<WorkshopActionResult> {
  await requirePermission("talleres.gestionar");
  const supabase = await createClient();
  const { error } = await supabase
    .from("workshops")
    .update({ active })
    .eq("id", id);
  if (error) return { error: "No se pudo actualizar el taller." };
  revalidatePath("/talleres");
  return { ok: true };
}

/**
 * Borra un taller (solo el admin). Solo si ninguna pieza lo tiene ni lo tuvo: lo garantiza
 * un trigger de la BD, que avisa con el 23503 y un mensaje listo para mostrar; si está en
 * uso, se desactiva.
 */
export async function deleteWorkshop(
  id: string,
): Promise<WorkshopActionResult> {
  await requirePermission("talleres.eliminar");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workshops")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) {
    return {
      error:
        error.code === "23503"
          ? error.message
          : "No se pudo eliminar el taller.",
    };
  }
  // Sin permiso (RLS) o ya borrado: el delete no falla, solo no toca filas.
  if (data.length === 0) return { error: "No se pudo eliminar el taller." };
  revalidatePath("/talleres");
  return { ok: true };
}
