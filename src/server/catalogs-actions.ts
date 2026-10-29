"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  CATALOGS,
  isCatalogKind,
  isPieceCatalogKind,
  type CatalogKind,
  type PieceCatalogKind,
} from "@/domain/catalogs";
import { createClient } from "@/lib/supabase/server";
import { INVALID_ARGS, idArg, validArgs } from "@/lib/validation/action-args";
import {
  catalogItemSchemaFor,
  type CatalogItemFormInput,
} from "@/lib/validation/catalogs";
import { requirePermission } from "@/server/auth";

export type CatalogActionResult = { ok: true } | { error: string };

type Client = Awaited<ReturnType<typeof createClient>>;

/** Inserta o actualiza el ítem; solo los servicios guardan precio sugerido. */
async function save(
  supabase: Client,
  kind: CatalogKind,
  input: CatalogItemFormInput,
  id?: string,
) {
  const parsed = catalogItemSchemaFor(kind).safeParse(input);
  if (!parsed.success) return { invalid: true as const };
  const { name, price, shopifyName } = parsed.data;

  if (kind === "services") {
    const row = { name, suggested_price: price };
    const { error } = id
      ? await supabase.from("services").update(row).eq("id", id)
      : await supabase.from("services").insert(row);
    return { error };
  }
  if (kind === "payment_methods") {
    const row = { name, shopify_name: shopifyName || null };
    const { error } = id
      ? await supabase.from("payment_methods").update(row).eq("id", id)
      : await supabase.from("payment_methods").insert(row);
    return { error };
  }
  const { error } = id
    ? await supabase.from(kind).update({ name }).eq("id", id)
    : await supabase.from(kind).insert({ name });
  return { error };
}

function failure(code: string | undefined, fallback: string) {
  return {
    error: code === "23505" ? "Ya existe un ítem con ese nombre." : fallback,
  };
}

export async function createCatalogItem(
  kind: CatalogKind,
  input: CatalogItemFormInput,
): Promise<CatalogActionResult> {
  await requirePermission("configuracion.gestionar");
  if (!isCatalogKind(kind)) return { error: "Catálogo inválido." };
  const result = await save(await createClient(), kind, input);
  if ("invalid" in result) return { error: "Revisa los datos ingresados." };
  if (result.error)
    return failure(result.error.code, "No se pudo crear el ítem.");
  revalidatePath(CATALOGS[kind].href);
  return { ok: true };
}

export async function updateCatalogItem(
  kind: CatalogKind,
  id: string,
  input: CatalogItemFormInput,
): Promise<CatalogActionResult> {
  await requirePermission("configuracion.gestionar");
  if (!validArgs([z.string(), idArg, z.unknown()], [kind, id, input]))
    return { error: INVALID_ARGS };
  if (!isCatalogKind(kind)) return { error: "Catálogo inválido." };
  const result = await save(await createClient(), kind, input, id);
  if ("invalid" in result) return { error: "Revisa los datos ingresados." };
  if (result.error)
    return failure(result.error.code, "No se pudo guardar el ítem.");
  revalidatePath(CATALOGS[kind].href);
  return { ok: true };
}

export async function setCatalogItemActive(
  kind: CatalogKind,
  id: string,
  active: boolean,
): Promise<CatalogActionResult> {
  await requirePermission("configuracion.gestionar");
  if (!validArgs([z.string(), idArg, z.boolean()], [kind, id, active]))
    return { error: INVALID_ARGS };
  if (!isCatalogKind(kind)) return { error: "Catálogo inválido." };

  const supabase = await createClient();
  // El material o servicio por defecto deja de serlo al desactivarlo (la BD lo exige).
  const { error } =
    isPieceCatalogKind(kind) && !active
      ? await supabase
          .from(kind)
          .update({ active, is_default: false })
          .eq("id", id)
      : await supabase.from(kind).update({ active }).eq("id", id);
  if (error) return { error: "No se pudo actualizar el ítem." };
  revalidatePath(CATALOGS[kind].href);
  return { ok: true };
}

/**
 * Marca (o desmarca) el material o servicio que ya viene elegido en cada pieza nueva.
 * A lo sumo uno por catálogo: primero se quita la marca al anterior.
 */
export async function setCatalogItemDefault(
  kind: PieceCatalogKind,
  id: string,
  isDefault: boolean,
): Promise<CatalogActionResult> {
  await requirePermission("configuracion.gestionar");
  if (!validArgs([z.string(), idArg, z.boolean()], [kind, id, isDefault]))
    return { error: INVALID_ARGS };
  if (!isPieceCatalogKind(kind)) return { error: "Catálogo inválido." };

  const supabase = await createClient();
  if (isDefault) {
    const { error } = await supabase
      .from(kind)
      .update({ is_default: false })
      .eq("is_default", true)
      .neq("id", id);
    if (error) return { error: "No se pudo actualizar el ítem." };
  }
  const { data, error } = await supabase
    .from(kind)
    .update({ is_default: isDefault })
    .eq("id", id)
    .select("id");
  // 23514: está desactivado.
  if (error) {
    return {
      error:
        error.code === "23514"
          ? "Activa el ítem antes de marcarlo por defecto."
          : "No se pudo actualizar el ítem.",
    };
  }
  if (data.length === 0) return { error: "No se pudo actualizar el ítem." };
  revalidatePath(CATALOGS[kind].href);
  return { ok: true };
}

/**
 * Borra un material, servicio o método de pago. Solo si nada lo usa (piezas y
 * cotizaciones de WhatsApp, o pagos): lo garantiza un trigger de la BD, que avisa con el
 * 23503 y un mensaje listo para mostrar; si está en uso, se desactiva.
 */
export async function deleteCatalogItem(
  kind: CatalogKind,
  id: string,
): Promise<CatalogActionResult> {
  await requirePermission("configuracion.gestionar");
  if (!validArgs([z.string(), idArg], [kind, id]))
    return { error: INVALID_ARGS };
  if (!isCatalogKind(kind)) return { error: "Catálogo inválido." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from(kind)
    .delete()
    .eq("id", id)
    .select("id");
  if (error) {
    return {
      error:
        error.code === "23503" ? error.message : "No se pudo eliminar el ítem.",
    };
  }
  // Sin permiso (RLS) o ya borrado: el delete no falla, solo no toca filas.
  if (data.length === 0) return { error: "No se pudo eliminar el ítem." };
  revalidatePath(CATALOGS[kind].href);
  return { ok: true };
}
