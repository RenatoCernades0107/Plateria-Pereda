import { expect, type Page } from "@playwright/test";

/** Fila de una pieza en la tabla de la guía (o en la tabla de /piezas). */
export const pieceRow = (page: Page, code: string) =>
  page.getByTestId(`pieza-${code}`);

/** Abre el menú «Acciones» de una pieza en la tabla de la guía. */
export async function openPieceActions(page: Page, code: string) {
  await pieceRow(page, code).getByRole("button", { name: "Acciones" }).click();
  return page.getByRole("menu");
}

/** Elige una acción del menú «Acciones» de la pieza (p. ej. "Aprobar", "Editar"). */
export async function pieceAction(page: Page, code: string, name: string) {
  const menu = await openPieceActions(page, code);
  await menu.getByRole("menuitem", { name, exact: true }).click();
}

/**
 * Espera a que la fila termine de guardar: el cambio se ve al instante (optimista) y
 * la BD lo recibe después; antes de recargar o navegar hay que esperar al guardado.
 */
export async function waitForPieceSaved(page: Page, code: string) {
  await expect(pieceRow(page, code).getByLabel("Guardando")).toHaveCount(0);
}

/** Nombres de las acciones que ofrece el menú de la pieza (lo cierra al terminar). */
export async function pieceActionNames(page: Page, code: string) {
  const menu = await openPieceActions(page, code);
  const names = await menu.getByRole("menuitem").allTextContents();
  await page.keyboard.press("Escape");
  return names.map((n) => n.trim());
}
