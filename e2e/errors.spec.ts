import { expect, test } from "./fixtures";

test.describe("Páginas de error", () => {
  test("una ruta inexistente muestra la página 404 amigable", async ({
    page,
    loginAs,
  }) => {
    await loginAs("ventas");
    const response = await page.goto("/esta-ruta-no-existe");
    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole("heading", { name: "Esta página no existe" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Ir al inicio" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("@mobile la página 404 se lee en el celular", async ({
    page,
    loginAs,
  }) => {
    await loginAs("logistica");
    await page.goto("/esta-ruta-no-existe");
    await expect(
      page.getByRole("heading", { name: "Esta página no existe" }),
    ).toBeVisible();
  });
});
