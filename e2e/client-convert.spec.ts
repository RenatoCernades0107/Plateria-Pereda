import type { APIRequestContext } from "@playwright/test";

import { expect, test } from "./fixtures";
import { adminClient } from "./support/supabase";

// Comparten el Shopify falso del servidor: en serie.
test.describe.configure({ mode: "serial" });

const run = `${Date.now()}`.slice(-6);
const digits = (n: number) =>
  Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join("");

/** RUC válido al azar (prefijo 20 y dígito verificador módulo 11). */
function randomRuc() {
  const base = `20${digits(8)}`;
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce((acc, w, i) => acc + w * Number(base[i]), 0);
  return `${base}${(11 - (sum % 11)) % 10}`;
}

type ShopifyState = {
  customers: { id: string; email: string | null }[];
  companies: {
    name: string;
    externalId: string;
    contacts: { id: string; customerId: string }[];
  }[];
};

async function shopifyState(request: APIRequestContext) {
  const response = await request.get("/api/test/shopify");
  return (await response.json()) as ShopifyState;
}

const firstName = `Rosa${run}`;
const personName = `${firstName} Conversión`;
const email = `rosa-${run}@correo.pe`;
const legalName = `Rosa ${run} S.A.C.`;
let detailUrl = "";

test.describe("Convertir persona en empresa", () => {
  test.afterAll(async () => {
    const admin = adminClient();
    const { data } = await admin
      .from("clients")
      .select("id, contacts(id)")
      .eq("legal_name", legalName);
    for (const row of data ?? []) {
      const ids = [row.id, ...row.contacts.map((k) => k.id)];
      await admin.from("contacts").delete().eq("client_id", row.id);
      await admin.from("clients").delete().eq("id", row.id);
      await admin.from("shopify_sync_jobs").delete().in("entity_id", ids);
    }
  });

  test("ventas no ve la opción de convertir", async ({ page, loginAs }) => {
    await loginAs("ventas");
    await page.goto("/clientes");
    await page.getByRole("button", { name: "Nuevo cliente" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Nombres").fill(firstName);
    await dialog.getByLabel("Apellidos").fill("Conversión");
    await dialog.getByLabel("Teléfono").fill(`9${digits(8)}`);
    await dialog.getByLabel("Email").fill(email);
    await dialog.getByRole("button", { name: "Registrar persona" }).click();
    const fila = page.getByTestId(`cliente-${personName}`);
    await expect(fila.getByTestId("estado-shopify")).toHaveText(
      "Shopify: Sincronizado",
      { timeout: 20_000 },
    );
    await fila.getByRole("link", { name: personName }).click();
    await expect(page).toHaveURL(/\/clientes\/[0-9a-f-]{36}$/, {
      timeout: 30_000,
    });
    detailUrl = new URL(page.url()).pathname;
    await expect(page.getByRole("heading", { name: personName })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Convertir en empresa" }),
    ).toHaveCount(0);
  });

  test("admin la convierte y en Shopify su cliente queda de contacto de la Company", async ({
    page,
    request,
    loginAs,
    makeAxeBuilder,
  }) => {
    await loginAs("admin");
    await page.goto(detailUrl);
    await page.getByRole("button", { name: "Convertir en empresa" }).click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("radio", { name: /Queda como contacto/ }),
    ).toBeChecked();
    const ruc = randomRuc();
    await dialog.getByLabel("Razón social").fill(legalName);
    await dialog.getByLabel("RUC").fill(ruc);

    const results = await makeAxeBuilder().include('[role="dialog"]').analyze();
    expect(
      results.violations.filter((v) =>
        ["critical", "serious"].includes(v.impact ?? ""),
      ),
    ).toEqual([]);

    await dialog.getByRole("button", { name: "Convertir en empresa" }).click();
    await expect(
      page.getByText(
        `${personName} ahora es una empresa y queda como su contacto.`,
      ),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: legalName })).toBeVisible();
    await expect(page.getByText("Empresa", { exact: true })).toBeVisible();
    const contacto = page.getByTestId(`contacto-${personName}`);
    await expect(contacto.getByTestId("estado-shopify")).toHaveText(
      "Shopify: Sincronizado",
      { timeout: 20_000 },
    );

    const state = await shopifyState(request);
    const customers = state.customers.filter((c) => c.email === email);
    expect(customers).toHaveLength(1);
    expect(state.companies.find((c) => c.name === legalName)).toMatchObject({
      externalId: ruc,
      contacts: [expect.objectContaining({ customerId: customers[0]!.id })],
    });
    await expect(
      page.getByRole("button", { name: "Convertir en empresa" }),
    ).toHaveCount(0);
  });
});
