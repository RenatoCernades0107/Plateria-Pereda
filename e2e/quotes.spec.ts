import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import { adminClient } from "./support/supabase";

// Comparten el Shopify falso del servidor y la cotización creada: en serie.
test.describe.configure({ mode: "serial" });

const run = `${Date.now()}`.slice(-7);
const shopifyName = `Cotiza${run} Shopify`;
const companyName = `Empresa Cotiza ${run} S.A.C.`;
const contactName = `Atendida${run} Compras`;
let firstQuoteUrl = "";
let firstQuoteCode = "";

/** RUC válido al azar (prefijo 20 y dígito verificador módulo 11). */
function randomRuc() {
  const base = `20${Array.from({ length: 8 }, () => Math.floor(Math.random() * 10)).join("")}`;
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce((acc, w, i) => acc + w * Number(base[i]), 0);
  return `${base}${(11 - (sum % 11)) % 10}`;
}

async function chooseClient(page: Page, text: string, name: RegExp) {
  await page
    .getByRole("combobox", { name: "Cliente o contacto de una empresa" })
    .click();
  await page.getByPlaceholder("Nombre, documento, teléfono o email").fill(text);
  await page.getByRole("option", { name }).click();
}

async function addProduct(page: Page, text: string, variant?: RegExp) {
  await page.getByRole("button", { name: "Agregar producto" }).click();
  await page.getByPlaceholder("Título o SKU").fill(text);
  await page
    .getByRole("option", { name: new RegExp(text, "i") })
    .first()
    .click();
  if (variant) await page.getByRole("option", { name: variant }).click();
}

const line = (page: Page, n: number) =>
  page.getByRole("group", { name: new RegExp(`^Línea ${n}:`) });

test.describe("Cotizaciones", () => {
  test.beforeAll(async ({ request }) => {
    // Cliente que solo está en Shopify (se guarda en el sistema al elegirlo).
    await request.post("/api/test/shopify", {
      data: {
        action: "customer",
        input: {
          firstName: `Cotiza${run}`,
          lastName: "Shopify",
          email: `cotiza${run}@correo.pe`,
          phone: `+5193${run}`,
        },
      },
    });
    // Empresa con un contacto interno.
    const admin = adminClient();
    const { data: company, error } = await admin
      .from("clients")
      .insert({
        kind: "empresa",
        legal_name: companyName,
        document_type: "ruc",
        document_number: randomRuc(),
        shopify_company_id: `gid://shopify/Company/e2e${run}`,
      })
      .select("id")
      .single();
    if (error) throw error;
    const { error: contactError } = await admin.from("contacts").insert({
      client_id: company.id,
      first_name: `Atendida${run}`,
      last_name: "Compras",
      shopify_customer_id: `gid://shopify/Customer/e2ec${run}`,
    });
    if (contactError) throw contactError;
  });

  test.afterAll(async () => {
    const admin = adminClient();
    const { data: clients } = await admin
      .from("clients")
      .select("id")
      .or(`legal_name.eq."${companyName}",first_name.eq.Cotiza${run}`);
    const ids = (clients ?? []).map((c) => c.id);
    if (ids.length === 0) return;
    await admin.from("quotes").delete().in("client_id", ids);
    await admin.from("contacts").delete().in("client_id", ids);
    await admin.from("clients").delete().in("id", ids);
  });

  test.beforeEach(async ({ loginAs }) => {
    await loginAs("ventas");
  });

  test("crea una cotización para un cliente de Shopify con 2 productos personalizados", async ({
    page,
    makeAxeBuilder,
  }) => {
    await page.goto("/cotizaciones");
    await page.getByRole("link", { name: "Nueva cotización" }).click();
    await expect(
      page.getByRole("heading", { name: "Nueva cotización" }),
    ).toBeVisible();

    // Sin cliente ni productos no se guarda.
    await page.getByRole("button", { name: "Guardar borrador" }).click();
    await expect(page.getByText("Elige un cliente")).toBeVisible();
    await expect(page.getByText("Agrega al menos un producto")).toBeVisible();

    await chooseClient(page, `Cotiza${run}`, new RegExp(shopifyName));
    await expect(
      page.getByText(`${shopifyName} se guardó en el sistema.`),
    ).toBeVisible();

    await addProduct(page, "anillo", /Talla 6/);
    await line(page, 1).getByLabel("Personalización").fill("Grabado: Ana");
    await line(page, 1).getByLabel("Cantidad").fill("2");

    await addProduct(page, "aretes");
    await line(page, 2)
      .getByLabel("Personalización")
      .fill("Filigrana con iniciales");
    await line(page, 2).getByLabel("Cantidad").fill("3");
    await line(page, 2).getByLabel("Descuento", { exact: true }).click();
    await page.getByRole("option", { name: "Porcentaje (%)" }).click();
    await line(page, 2).getByLabel("Descuento (%)").fill("10");

    // 2 × 150 + 3 × 180 − 10 % de 540
    await expect(page.getByTestId("subtotal")).toHaveText("S/ 840.00");
    await expect(page.getByTestId("descuentos")).toHaveText("− S/ 54.00");
    await expect(page.getByTestId("total")).toHaveText("S/ 786.00");

    await page.getByLabel("Notas").fill("Entrega en 10 días hábiles.");
    const results = await makeAxeBuilder().analyze();
    expect(
      results.violations.filter((v) =>
        ["critical", "serious"].includes(v.impact ?? ""),
      ),
    ).toEqual([]);
    await page.getByRole("button", { name: "Guardar borrador" }).click();
    await expect(page.getByText("Borrador guardado.")).toBeVisible();
    await expect(page).toHaveURL(/\/cotizaciones\/[0-9a-f-]{36}$/);
    const heading = page.getByRole("heading", {
      name: /^Cotización COT-\d{6}$/,
    });
    await expect(heading).toBeVisible();
    firstQuoteUrl = page.url();
    firstQuoteCode = (await heading.textContent())!.replace("Cotización ", "");
    await expect(page.getByTestId("estado-cotizacion")).toHaveText("Borrador");
    await expect(page.getByTestId("total")).toHaveText("S/ 786.00");
    await expect(line(page, 1).getByLabel("Personalización")).toHaveValue(
      "Grabado: Ana",
    );

    // Aparece en el listado al buscar por el cliente.
    await page.goto("/cotizaciones");
    await page.getByLabel("Código o cliente").fill(`Cotiza${run}`);
    await page.getByRole("button", { name: "Filtrar" }).click();
    const row = page.getByTestId(`cotizacion-${firstQuoteCode}`);
    await expect(row).toContainText(shopifyName);
    await expect(row).toContainText("Borrador");
    await expect(row).toContainText("S/ 786.00");
    const listResults = await makeAxeBuilder().analyze();
    expect(
      listResults.violations.filter((v) =>
        ["critical", "serious"].includes(v.impact ?? ""),
      ),
    ).toEqual([]);
  });

  test("crea una cotización para un contacto interno de una empresa", async ({
    page,
  }) => {
    await page.goto("/cotizaciones/nueva");
    await chooseClient(page, `Atendida${run}`, new RegExp(contactName));
    await expect(
      page.getByText(
        `Se cotiza a ${companyName} con atención a ${contactName}.`,
      ),
    ).toBeVisible();

    await page.getByRole("button", { name: "Agregar producto" }).click();
    await page.getByRole("option", { name: /Línea libre/ }).click();
    await line(page, 1).getByLabel("Producto").fill("Bandeja grabada a pedido");
    await line(page, 1).getByLabel("Precio unitario (S/)").fill("1250.50");
    await expect(page.getByTestId("total")).toHaveText("S/ 1,250.50");

    await page.getByRole("button", { name: "Emitir" }).click();
    await expect(page.getByText("Cotización emitida.")).toBeVisible();
    await expect(page.getByTestId("estado-cotizacion")).toHaveText("Emitida");
    await expect(page.getByTestId("cliente-cotizacion")).toContainText(
      `Atención: ${contactName}`,
    );
    // Emitida ya no se edita.
    await expect(
      page.getByRole("button", { name: "Guardar borrador" }),
    ).toHaveCount(0);

    await page.goto(`/cotizaciones?estado=emitida&q=${run}`);
    await expect(page.getByRole("cell", { name: companyName })).toContainText(
      `Atención: ${contactName}`,
    );
  });

  test("duplica una cotización", async ({ page }) => {
    await page.goto(firstQuoteUrl);
    await page.getByRole("button", { name: "Duplicar cotización" }).click();
    await expect(
      page.getByText("Se creó una copia en borrador."),
    ).toBeVisible();
    await expect(page).not.toHaveURL(firstQuoteUrl);
    await expect(page.getByText(`Copia de ${firstQuoteCode}`)).toBeVisible();
    await expect(page.getByTestId("estado-cotizacion")).toHaveText("Borrador");
    await expect(page.getByTestId("total")).toHaveText("S/ 786.00");
    await expect(line(page, 2).getByLabel("Personalización")).toHaveValue(
      "Filigrana con iniciales",
    );
    await expect(
      page.getByRole("heading", { name: /^Cotización COT-\d{6}$/ }),
    ).not.toHaveText(`Cotización ${firstQuoteCode}`);
  });

  test("crea una cotización desde el celular @mobile", async ({ page }) => {
    await page.goto("/cotizaciones/nueva");
    await chooseClient(page, `Cotiza${run}`, new RegExp(shopifyName));
    await addProduct(page, "anillo", /Talla 8/);
    await line(page, 1).getByLabel("Personalización").fill("Grabado móvil");
    await expect(page.getByTestId("total")).toHaveText("S/ 165.50");
    await page.getByRole("button", { name: "Guardar borrador" }).click();
    await expect(page.getByText("Borrador guardado.")).toBeVisible();
    await expect(page).toHaveURL(/\/cotizaciones\/[0-9a-f-]{36}$/);

    await page.goto(`/cotizaciones?q=Cotiza${run}`);
    await expect(
      page.getByRole("link", { name: /^COT-\d{6}$/ }).first(),
    ).toBeVisible();
  });
});
