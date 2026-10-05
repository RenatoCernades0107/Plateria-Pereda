import { expect, test } from "./fixtures";

test.describe("Selector de productos del cotizador", () => {
  test.beforeEach(async ({ loginAs }) => {
    await loginAs("ventas");
  });

  test("busca en el catálogo, elige la variante y crea la línea con el precio del catálogo", async ({
    page,
  }) => {
    await page.goto("/cotizaciones/nueva");
    await page.getByRole("button", { name: "Agregar producto" }).click();
    await page.getByPlaceholder("Título o SKU").fill("anillo");
    const product = page.getByRole("option", {
      name: /Anillo de plata personalizable/,
    });
    await expect(product).toContainText("S/ 150.00 – S/ 165.50");
    await product.click();

    const variant = page.getByRole("option", { name: /Talla 8/ });
    await expect(variant).toContainText("SKU ANI-950-08");
    await variant.click();

    const line = page.getByRole("group", {
      name: "Línea 1: Anillo de plata personalizable — Talla 8",
    });
    await expect(line).toBeVisible();
    await expect(line.getByLabel("Precio unitario (S/)")).toHaveValue("165.50");
    await expect(line.getByLabel("Cantidad")).toHaveValue("1");
    await expect(page.getByTestId("total")).toHaveText("S/ 165.50");

    // La línea es editable: personalización y cantidad.
    await line.getByLabel("Personalización").fill("Grabado interior: Ana");
    await line.getByLabel("Cantidad").fill("2");
    await expect(page.getByTestId("total")).toHaveText("S/ 331.00");
  });
});
