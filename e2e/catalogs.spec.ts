import { expect, test } from "./fixtures";
import { adminClient } from "./support/supabase";

const unique = (prefix: string) =>
  `${prefix} ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

test.describe("Catálogos", () => {
  const created: { table: "materials" | "services"; name: string }[] = [];

  test.afterAll(async () => {
    for (const { table, name } of created) {
      await adminClient().from(table).delete().ilike("name", name);
    }
  });

  test("el admin agrega, edita y desactiva un servicio con precio sugerido", async ({
    page,
    loginAs,
    makeAxeBuilder,
  }) => {
    await loginAs("admin");
    const name = unique("Soldadura E2E");
    created.push({ table: "services", name });

    await page.goto("/configuracion");
    await page
      .getByRole("navigation", { name: "Secciones de configuración" })
      .getByRole("link", { name: "Servicios" })
      .click();
    await expect(page).toHaveURL(/\/configuracion\/servicios$/);

    await page.getByRole("button", { name: "Agregar" }).click();
    let dialog = page.getByRole("dialog");
    await dialog.getByLabel("Nombre").fill(name);
    await dialog.getByLabel("Precio sugerido (S/)").fill("45,5");
    await dialog.getByRole("button", { name: "Agregar" }).click();
    const item = page.getByTestId(`catalogo-${name}`);
    await expect(item).toContainText("S/ 45.50");

    await item.getByRole("button", { name: `Editar ${name}` }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("Precio sugerido (S/)").fill("50");
    await dialog.getByRole("button", { name: "Guardar" }).click();
    await expect(item).toContainText("S/ 50.00");

    await item.getByRole("button", { name: "Desactivar" }).click();
    await expect(item).toContainText("Inactivo");

    await page.reload();
    await expect(item).toContainText("S/ 50.00");
    await expect(item).toContainText("Inactivo");

    const results = await makeAxeBuilder().analyze();
    expect(
      results.violations.filter((v) =>
        ["critical", "serious"].includes(v.impact ?? ""),
      ),
    ).toEqual([]);
  });

  test("los métodos de pago iniciales están cargados y no se repiten nombres", async ({
    page,
    loginAs,
  }) => {
    await loginAs("admin");
    await page.goto("/configuracion/metodos-de-pago");
    for (const metodo of ["Efectivo", "Tarjeta", "Yape", "Plin"]) {
      await expect(page.getByTestId(`catalogo-${metodo}`)).toBeVisible();
    }
    await page.getByRole("button", { name: "Agregar" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Nombre").fill("yape");
    await dialog.getByRole("button", { name: "Agregar" }).click();
    await expect(
      dialog.getByText("Ya existe un ítem con ese nombre."),
    ).toBeVisible();
  });

  test("ventas no entra a los catálogos", async ({ page, loginAs }) => {
    await loginAs("ventas");
    for (const ruta of [
      "/configuracion/materiales",
      "/configuracion/servicios",
      "/configuracion/metodos-de-pago",
    ]) {
      const response = await page.goto(ruta);
      expect(response?.status()).toBe(403);
    }
  });

  test("agrega un material desde el celular @mobile", async ({
    page,
    loginAs,
    isMobile,
  }) => {
    test.skip(!isMobile, "Solo aplica al proyecto móvil");
    await loginAs("admin");
    const name = unique("Plata Móvil");
    created.push({ table: "materials", name });

    await page.goto("/configuracion/materiales");
    await page.getByRole("button", { name: "Agregar" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Nombre").fill(name);
    await dialog.getByRole("button", { name: "Agregar" }).click();
    await expect(page.getByTestId(`catalogo-${name}`)).toBeVisible();
    const scrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    expect(scrollWidth).toBeLessThanOrEqual(
      page.viewportSize()?.width ?? Infinity,
    );
  });
});
