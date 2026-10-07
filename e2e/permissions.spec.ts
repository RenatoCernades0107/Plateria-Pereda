import { NAV_ITEMS } from "../src/lib/navigation";
import { expect, test } from "./fixtures";

const nav = (page: import("@playwright/test").Page) =>
  page.getByRole("list", { name: "Navegación principal" });

test.describe("Permisos por rol", () => {
  test("logística ve solo sus módulos y entra a la vista de piezas", async ({
    page,
    loginAs,
  }) => {
    await loginAs("logistica");
    await page.goto("/");
    await expect(page).toHaveURL(/\/piezas$/);
    await expect(nav(page).getByRole("link")).toHaveText([
      "Restauraciones",
      "Piezas",
      "Clientes",
      "Talleres",
    ]);
  });

  for (const ruta of [
    "/dashboard",
    "/usuarios",
    "/configuracion",
    "/cotizaciones",
    "/cotizaciones-whatsapp",
    "/auditoria",
  ]) {
    test(`logística recibe 403 en ${ruta}`, async ({ page, loginAs }) => {
      await loginAs("logistica");
      const response = await page.goto(ruta);
      expect(response?.status()).toBe(403);
      await expect(
        page.getByRole("heading", { name: "No tienes acceso a esta sección" }),
      ).toBeVisible();
    });
  }

  test("ventas no ve ni entra a la administración", async ({
    page,
    loginAs,
  }) => {
    await loginAs("ventas");
    await page.goto("/dashboard");
    await expect(nav(page).getByRole("link")).toHaveText([
      "Dashboard",
      "Restauraciones",
      "Piezas",
      "Cotizaciones de WhatsApp",
      "Clientes",
      "Cotizaciones",
    ]);
    for (const ruta of [
      "/usuarios",
      "/talleres",
      "/configuracion",
      "/auditoria",
    ]) {
      const response = await page.goto(ruta);
      expect(response?.status()).toBe(403);
    }
  });

  test("admin ve todos los módulos", async ({ page, loginAs }) => {
    await loginAs("admin");
    await page.goto("/dashboard");
    await expect(nav(page).getByRole("link")).toHaveText(
      NAV_ITEMS.map((item) => item.title),
    );
  });

  test("la página 403 lleva de vuelta al inicio", async ({ page, loginAs }) => {
    await loginAs("logistica");
    await page.goto("/usuarios");
    await page.getByRole("link", { name: "Ir al inicio" }).click();
    await expect(page).toHaveURL(/\/piezas$/);
  });
});
