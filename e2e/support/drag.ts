import type { Locator, Page } from "@playwright/test";

/**
 * Arrastra con el ratón como lo haría una persona (dnd-kit no usa el arrastre
 * nativo del navegador): pulsa sobre `source`, se mueve en pasos hasta el centro
 * de `target` y suelta. `during` corre con la tarjeta en el aire.
 */
export async function dragWithMouse(
  page: Page,
  source: Locator,
  target: Locator,
  during?: () => Promise<void>,
) {
  // Que se vea la columna de destino (moviendo el tablero lo menos posible).
  await target.evaluate((el) =>
    el.scrollIntoView({ block: "nearest", inline: "nearest" }),
  );
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error("No se ve la tarjeta o la columna");
  const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  const end = { x: to.x + to.width / 2, y: to.y + to.height / 2 };

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  // Pasa la distancia mínima para que empiece el arrastre.
  await page.mouse.move(start.x + 12, start.y + 4, { steps: 4 });
  await page.mouse.move(end.x, end.y, { steps: 20 });
  await page.mouse.move(end.x + 2, end.y + 2, { steps: 2 });
  await during?.();
  await page.mouse.up();
}
