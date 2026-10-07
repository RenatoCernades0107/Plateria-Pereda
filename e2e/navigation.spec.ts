import { NAV_ITEMS } from "../src/lib/navigation";
import { expect, test } from "./fixtures";

test.describe("Navegación", () => {
  test.beforeEach(async ({ loginAs }) => {
    await loginAs("admin");
  });

  test("recorre todos los módulos desde el menú lateral", async ({ page }) => {
    await page.goto("/dashboard");
    const nav = page.getByRole("list", { name: "Navegación principal" });

    // exact: "Cotizaciones" no debe coincidir con "Cotizaciones de WhatsApp".
    for (const item of NAV_ITEMS) {
      const link = nav.getByRole("link", { name: item.title, exact: true });
      await link.click();
      await expect(page).toHaveURL(new RegExp(`${item.href}$`));
      await expect(
        page.getByRole("heading", { level: 1, name: item.title, exact: true }),
      ).toBeVisible();
      await expect(link).toHaveAttribute("data-active", "true");
    }
  });

  test("en el celular el menú se abre como panel y navega @mobile", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "Solo aplica al proyecto móvil");
    await page.goto("/dashboard");

    const nav = page.getByRole("list", { name: "Navegación principal" });
    await expect(nav).toBeHidden();

    await page.getByRole("button", { name: "Abrir o cerrar el menú" }).click();
    const panel = page.getByRole("dialog");
    await expect(panel).toBeVisible();

    await panel.getByRole("link", { name: "Clientes" }).click();
    await expect(page).toHaveURL(/\/clientes$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Clientes" }),
    ).toBeVisible();
    await expect(panel).toBeHidden();
  });
});
