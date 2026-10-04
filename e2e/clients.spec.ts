import type { APIRequestContext, Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import { adminClient } from "./support/supabase";

// Comparten el Shopify falso del servidor (y sus errores forzados): en serie.
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

async function shopifyState(request: APIRequestContext) {
  const response = await request.get("/api/test/shopify");
  return (await response.json()) as {
    customers: {
      firstName: string;
      email: string | null;
      phone: string | null;
    }[];
    companies: {
      name: string;
      externalId: string;
      address: { zoneCode: string };
    }[];
  };
}

async function createPerson(
  page: Page,
  firstName: string,
  phone: string,
  email = "",
) {
  await page.getByRole("button", { name: "Nuevo cliente" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nombres").fill(firstName);
  await dialog.getByLabel("Apellidos").fill("Prueba E2E");
  await dialog.getByLabel("Tipo de documento").click();
  await page.getByRole("option", { name: "DNI" }).click();
  await dialog.getByLabel("Número de documento").fill(digits(8));
  await dialog.getByLabel("Teléfono").fill(phone);
  if (email) await dialog.getByLabel("Email").fill(email);
  await dialog.getByRole("button", { name: "Registrar persona" }).click();
}

const created: string[] = [];

test.describe("Clientes", () => {
  test.beforeEach(async ({ loginAs }) => {
    await loginAs("ventas");
  });

  test.afterAll(async () => {
    const admin = adminClient();
    for (const name of created) {
      const { data } = await admin
        .from("clients")
        .select("id")
        .eq("display_name", name);
      for (const row of data ?? []) {
        await admin.from("contacts").delete().eq("client_id", row.id);
        await admin.from("clients").delete().eq("id", row.id);
      }
    }
  });

  test("ventas registra una persona y queda sincronizada con Shopify", async ({
    page,
    request,
    makeAxeBuilder,
  }) => {
    const firstName = `Ana ${run}`;
    const email = `ana-${run}@correo.pe`;
    created.push(`${firstName} Prueba E2E`);

    await page.goto("/clientes");
    await createPerson(page, firstName, `9${digits(8)}`, email);
    await expect(
      page.getByText(/registrado\. Se está enviando a Shopify/),
    ).toBeVisible();

    const fila = page.getByTestId(`cliente-${firstName} Prueba E2E`);
    await expect(fila).toContainText("Persona");
    await expect(fila.getByTestId("estado-shopify")).toHaveText(
      "Shopify: Sincronizado",
      {
        timeout: 20_000,
      },
    );

    const state = await shopifyState(request);
    expect(state.customers).toContainEqual(
      expect.objectContaining({
        firstName,
        email,
        phone: expect.stringMatching(/^\+519/),
      }),
    );

    const results = await makeAxeBuilder().analyze();
    expect(
      results.violations.filter((v) =>
        ["critical", "serious"].includes(v.impact ?? ""),
      ),
    ).toEqual([]);
  });

  test("ventas registra una empresa como Company de Shopify", async ({
    page,
    request,
  }) => {
    const legalName = `Joyería ${run} S.A.C.`;
    const ruc = randomRuc();
    created.push(legalName);

    await page.goto("/clientes");
    await page.getByRole("button", { name: "Nuevo cliente" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("tab", { name: "Empresa" }).click();
    await dialog.getByLabel("Razón social").fill(legalName);
    await dialog.getByLabel("RUC").fill(ruc);
    await dialog.getByLabel("Teléfono").fill("(01) 234-5678");
    await dialog.getByLabel("Región").click();
    await page.getByRole("option", { name: "Arequipa" }).click();
    await dialog.getByLabel("Ciudad").fill("Arequipa");
    await dialog.getByRole("button", { name: "Registrar empresa" }).click();

    const fila = page.getByTestId(`cliente-${legalName}`);
    await expect(fila).toContainText(`RUC ${ruc}`);
    await expect(fila.getByTestId("estado-shopify")).toHaveText(
      "Shopify: Sincronizado",
      {
        timeout: 20_000,
      },
    );
    const state = await shopifyState(request);
    expect(state.companies).toContainEqual(
      expect.objectContaining({
        name: legalName,
        externalId: ruc,
        address: expect.objectContaining({ zoneCode: "ARE" }),
      }),
    );
  });

  test("si Shopify rechaza el alta queda en error y se puede reintentar", async ({
    page,
    request,
  }) => {
    const firstName = `Rosa ${run}`;
    created.push(`${firstName} Prueba E2E`);
    await request.post("/api/test/shopify", {
      data: {
        action: "fail",
        method: "createCustomer",
        kind: "user",
        message: "Rechazo de prueba",
      },
    });

    await page.goto("/clientes");
    await createPerson(page, firstName, `9${digits(8)}`);
    const fila = page.getByTestId(`cliente-${firstName} Prueba E2E`);
    await expect(fila.getByTestId("estado-shopify")).toHaveText(
      "Shopify: Error",
      {
        timeout: 20_000,
      },
    );

    await fila.getByRole("button", { name: "Reintentar" }).click();
    await expect(
      page.getByText("Reintentando la sincronización con Shopify."),
    ).toBeVisible();
    await expect(fila.getByTestId("estado-shopify")).toHaveText(
      "Shopify: Sincronizado",
      {
        timeout: 20_000,
      },
    );
  });

  test("un documento repetido muestra un error", async ({ page }) => {
    const dni = digits(8);
    const firstName = `Doble ${run}`;
    created.push(`${firstName} Prueba E2E`);
    await page.goto("/clientes");
    for (let i = 0; i < 2; i++) {
      await page.getByRole("button", { name: "Nuevo cliente" }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByLabel("Nombres").fill(firstName);
      await dialog.getByLabel("Apellidos").fill("Prueba E2E");
      await dialog.getByLabel("Tipo de documento").click();
      await page.getByRole("option", { name: "DNI" }).click();
      await dialog.getByLabel("Número de documento").fill(dni);
      await dialog.getByLabel("Teléfono").fill(`9${digits(8)}`);
      await dialog.getByRole("button", { name: "Registrar persona" }).click();
    }
    await expect(
      page
        .getByRole("dialog")
        .getByText("Ya existe un cliente con ese documento."),
    ).toBeVisible();
  });

  test("logística ve los clientes pero no los registra", async ({
    page,
    loginAs,
  }) => {
    await loginAs("logistica");
    await page.goto("/clientes");
    await expect(page.getByRole("heading", { name: "Clientes" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Nuevo cliente" }),
    ).toHaveCount(0);
  });

  test("registra un cliente desde el celular @mobile", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "Solo aplica al proyecto móvil");
    const firstName = `Móvil ${run}`;
    created.push(`${firstName} Prueba E2E`);
    await page.goto("/clientes");
    await createPerson(page, firstName, `9${digits(8)}`);
    await expect(
      page.getByTestId(`cliente-movil-${firstName} Prueba E2E`),
    ).toBeVisible();
    const scrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    expect(scrollWidth).toBeLessThanOrEqual(
      page.viewportSize()?.width ?? Infinity,
    );
  });
});
