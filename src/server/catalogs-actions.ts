"use server";

import { refresh, revalidatePath } from "next/cache";

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

/** Materiales y servicios: los que se crean desde el formulario de la pieza. */
export type PieceCatalogKind = "materials" | "services";

export type CatalogOptionResult =
  { ok: true; option: { id: string; name: string } } | { error: string };

/**
 * Crea un material o servicio desde el buscador de la pieza (admin y ventas, quienes
 * registran y editan piezas). Si ya existe, aunque esté desactivado, se reutiliza. El
 * precio sugerido del servicio lo pone el admin en Configuración.
 */
export async function createCatalogOption(
  kind: PieceCatalogKind,
  name: string,
): Promise<CatalogOptionResult> {
  await requirePermission("restauraciones.editar");
  if (kind !== "materials" && kind !== "services") {
    return { error: "Catálogo inválido." };
  }
  const parsed = catalogItemSchema.shape.name.safeParse(name);
  if (!parsed.success)
    return { error: "Escribe un nombre de hasta 100 caracteres." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("create_catalog_option", { p_kind: kind, p_name: parsed.data })
    .single();
  if (error || !data) return { error: "No se pudo crear el ítem." };
  revalidatePath(CATALOGS[kind].href);
  // Los demás buscadores de la página (otras piezas) también lo ofrecen.
  refresh();
  return { ok: true, option: { id: data.id, name: data.name } };
}
