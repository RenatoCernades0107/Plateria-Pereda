import type { Locator, Page } from "@playwright/test";

/**
 * Elige un servicio o material en el buscador de la pieza; si no existe en el
 * catálogo, lo crea desde ahí mismo. Los materiales (varios) dejan el buscador
 * abierto: se cierra con Escape.
 */
export async function chooseCatalog(
  page: Page,
  field: Locator,
  name: string,
  { multiple = false }: { multiple?: boolean } = {},
) {
  await field.click();
  await page.getByPlaceholder("Buscar o crear…").last().fill(name);
  await page
    .getByRole("option", { name, exact: true })
    .or(page.getByRole("option", { name: `Crear «${name}»` }))
    .first()
    .click();
  if (multiple) {
    await page.keyboard.press("Escape");
  }
  await field.filter({ hasText: name }).waitFor();
}
