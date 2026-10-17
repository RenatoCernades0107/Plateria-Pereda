import type { Locator, Page } from "@playwright/test";

import { adminClient } from "./supabase";

/**
 * Elige un servicio o material que ya está en el catálogo, en el buscador de la pieza.
 * El buscador no crea ítems (solo el admin, en Configuración): se dejan listos antes con
 * `ensureCatalogItem`. Los materiales (varios) dejan el buscador abierto: se cierra con
 * Escape.
 */
export async function chooseCatalog(
  page: Page,
  field: Locator,
  name: string,
  { multiple = false }: { multiple?: boolean } = {},
) {
  await field.click();
  await page.getByPlaceholder("Buscar…").last().fill(name);
  await page.getByRole("option", { name, exact: true }).click();
  if (multiple) {
    await page.keyboard.press("Escape");
  }
  await field.filter({ hasText: name }).waitFor();
}

/**
 * Deja un servicio o material en el catálogo (activo) para los tests que lo eligen o lo
 * escriben en una pieza. Si ya existe, sin distinguir mayúsculas, lo reutiliza.
 */
export async function ensureCatalogItem(
  table: "materials" | "services",
  name: string,
) {
  const admin = adminClient();
  const find = () =>
    admin.from(table).select("id, active").ilike("name", name).maybeSingle();

  let { data } = await find();
  if (!data) {
    const { error } = await admin.from(table).insert({ name });
    // Otro test lo creó al mismo tiempo (nombre único).
    if (error && error.code !== "23505") throw error;
    data = (await find()).data;
  }
  if (!data) throw new Error(`No se pudo dejar "${name}" en ${table}.`);
  if (!data.active) {
    await admin.from(table).update({ active: true }).eq("id", data.id);
  }
  return data.id;
}
