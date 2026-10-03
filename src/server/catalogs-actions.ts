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
  const { name, price } = parsed.data;

  if (kind === "services") {
    const row = { name, suggested_price: price };
    const { error } = id
      ? await supabase.from("services").update(row).eq("id", id)
      : await supabase.from("services").insert(row);
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
