import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import { adminClient } from "./support/supabase";

const unique = (prefix: string) =>
  `${prefix} ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

async function createWorkshop(page: Page, name: string, phone = "") {
  await page.getByRole("button", { name: "Nuevo taller" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nombre").fill(name);
  if (phone) await dialog.getByLabel("Teléfono").fill(phone);
  await dialog.getByRole("button", { name: "Crear taller" }).click();
}

test.describe("Talleres", () => {
  const created: string[] = [];

  test.beforeEach(async ({ loginAs }) => {
    await loginAs("logistica");
  });

  test.afterAll(async () => {
    // Los talleres no se borran desde la app; los de prueba se limpian con la clave secreta.
    for (const name of created) {
      await adminClient().from("workshops").delete().ilike("name", name);
    }
  });

  test("logística crea, edita y desactiva un taller", async ({
    page,
    makeAxeBuilder,
  }) => {
    const name = unique("Taller E2E");
    const renamed = `${name} Norte`;
    created.push(name, renamed);

    await page.goto("/talleres");
    await createWorkshop(page, name, "999 111 222");
    await expect(page.getByText(`Taller "${name}" creado.`)).toBeVisible();
    let fila = page.getByTestId(`taller-${name}`);
    await expect(fila).toContainText("999 111 222");
    await expect(fila).toContainText("Activo");

    await fila.getByRole("button", { name: `Editar ${name}` }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Nombre").fill(renamed);
    await dialog.getByLabel("Persona de contacto").fill("Don José");
    await dialog.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Taller actualizado.")).toBeVisible();
    fila = page.getByTestId(`taller-${renamed}`);
    await expect(fila).toContainText("Don José · 999 111 222");

    await fila.getByRole("button", { name: "Desactivar" }).click();
    await expect(page.getByText(`${renamed} fue desactivado.`)).toBeVisible();
    await expect(fila).toContainText("Inactivo");
    await expect(fila.getByRole("button", { name: "Activar" })).toBeVisible();

    const results = await makeAxeBuilder().analyze();
    expect(
      results.violations.filter((v) =>
        ["critical", "serious"].includes(v.impact ?? ""),
      ),
    ).toEqual([]);
  });

  test("un nombre duplicado muestra un error", async ({ page }) => {
    const name = unique("Taller Duplicado");
    created.push(name);

    await page.goto("/talleres");
    await createWorkshop(page, name);
    await expect(page.getByText(`Taller "${name}" creado.`)).toBeVisible();

    await createWorkshop(page, name.toUpperCase());
    await expect(
      page.getByRole("dialog").getByText("Ya existe un taller con ese nombre."),
    ).toBeVisible();
  });

  test("crea un taller desde el celular @mobile", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "Solo aplica al proyecto móvil");
    const name = unique("Taller Móvil");
    created.push(name);

    await page.goto("/talleres");
    await createWorkshop(page, name, "988 777 666");
    const tarjeta = page.getByTestId(`taller-movil-${name}`);
    await expect(tarjeta).toContainText("988 777 666");
    const scrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    expect(scrollWidth).toBeLessThanOrEqual(
      page.viewportSize()?.width ?? Infinity,
    );
  });
});
