"use server";

import { revalidatePath } from "next/cache";

import { CATALOGS, isCatalogKind, type CatalogKind } from "@/domain/catalogs";
import { createClient } from "@/lib/supabase/server";
import {
  catalogItemSchema,
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
  const parsed = catalogItemSchema.safeParse(input);
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
  if (!isCatalogKind(kind)) return { error: "Catálogo inválido." };

  const supabase = await createClient();
  const { error } = await supabase.from(kind).update({ active }).eq("id", id);
  if (error) return { error: "No se pudo actualizar el ítem." };
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
