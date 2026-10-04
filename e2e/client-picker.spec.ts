import { expect, test } from "./fixtures";
import { adminClient } from "./support/supabase";

// Usa el Shopify falso compartido del servidor.
test.describe.configure({ mode: "serial" });

const run = `${Date.now()}`.slice(-7);
const dni = `4${run}`;
const phone = `+5191${run}`;
const created: string[] = [];

test.describe("Buscador de clientes", () => {
  test.beforeAll(async () => {
    const { data, error } = await adminClient()
      .from("clients")
      .insert({
        kind: "persona",
        first_name: `Buscable ${run}`,
        last_name: "Prueba",
        document_type: "dni",
        document_number: dni,
        phone,
        // Ya sincronizado: no encola trabajo para el Shopify falso.
        shopify_customer_id: `gid://shopify/Customer/e2e${run}`,
      })
      .select("id")
      .single();
    if (error) throw error;
    created.push(data.id);
  });

  test.afterAll(async () => {
    const admin = adminClient();
    const { data } = await admin
      .from("clients")
      .select("id")
      .or(`id.in.(${created.join(",")}),first_name.eq.Solo${run}`);
    for (const row of data ?? [])
      await admin.from("clients").delete().eq("id", row.id);
  });

  test.beforeEach(async ({ loginAs }) => {
    await loginAs("ventas");
  });

  for (const [criterio, texto] of [
    ["nombre", `Buscable ${run}`],
    ["documento", dni],
    ["teléfono", `91${run}`],
  ]) {
    test(`busca por ${criterio}`, async ({ page }) => {
      await page.goto("/clientes");
      await page.getByRole("combobox", { name: "Buscar cliente" }).click();
      await page
        .getByRole("combobox", { name: "Buscar cliente" })
        .last()
        .fill(texto!);
      const option = page.getByRole("option", {
        name: new RegExp(`Buscable ${run}`),
      });
      await expect(option).toBeVisible();
      await expect(option).toContainText(`DNI ${dni}`);
    });
  }

  test("elegir un cliente que solo está en Shopify lo guarda en el sistema", async ({
    page,
    request,
  }) => {
    await request.post("/api/test/shopify", {
      data: {
        action: "customer",
        input: {
          firstName: `Solo${run}`,
          lastName: "Shopify",
          email: `solo${run}@correo.pe`,
          phone: `+5192${run}`,
        },
      },
    });

    await page.goto("/clientes");
    await page.getByRole("combobox", { name: "Buscar cliente" }).click();
    await page
      .getByRole("combobox", { name: "Buscar cliente" })
      .last()
      .fill(`Solo${run}`);
    const option = page.getByRole("option", {
      name: new RegExp(`Solo${run} Shopify`),
    });
    await expect(option).toContainText("Solo en Shopify");
    await option.click();

    await expect(
      page.getByText(`Solo${run} Shopify se guardó en el sistema.`),
    ).toBeVisible();
    await expect(page.getByTestId(`cliente-Solo${run} Shopify`)).toContainText(
      "Persona",
    );

    // Al volver a buscarlo aparece como cliente del sistema, sin duplicarse.
    await page
      .getByRole("combobox", { name: "Buscar cliente" })
      .first()
      .click();
    await page
      .getByRole("combobox", { name: "Buscar cliente" })
      .last()
      .fill(`Solo${run}`);
    const again = page.getByRole("option", {
      name: new RegExp(`Solo${run} Shopify`),
    });
    await expect(again).toHaveCount(1);
    await expect(again).not.toContainText("Solo en Shopify");
  });

  test("ofrece crear un cliente nuevo desde el buscador", async ({ page }) => {
    await page.goto("/clientes");
    await page.getByRole("combobox", { name: "Buscar cliente" }).click();
    await page.getByRole("option", { name: "Crear nuevo cliente" }).click();
    await expect(
      page.getByRole("dialog", { name: "Nuevo cliente" }),
    ).toBeVisible();
  });
});
