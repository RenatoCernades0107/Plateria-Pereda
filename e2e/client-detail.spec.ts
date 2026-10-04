import type { APIRequestContext, Page } from "@playwright/test";

import {
  FAKE_SHOP_DOMAIN,
  FAKE_WEBHOOK_SECRET,
} from "../src/server/shopify-webhooks/config";
import { signWebhook } from "../src/server/shopify-webhooks/hmac";
import { expect, test } from "./fixtures";
import { adminClient } from "./support/supabase";

// Comparten el Shopify falso del servidor y la empresa creada: en serie.
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

const legalName = `Detalle ${run} S.A.C.`;
const contactName = `Contacto${run} Prueba`;
let detailUrl = "";

async function shopifyCompanies(request: APIRequestContext) {
  const response = await request.get("/api/test/shopify");
  const state = (await response.json()) as {
    companies: {
      name: string;
      phone: string | null;
      address: { city: string; zoneCode: string };
    }[];
  };
  return state.companies;
}

async function openSearch(page: Page, text: string) {
  await page.getByRole("combobox", { name: "Buscar cliente" }).click();
  await page
    .getByRole("combobox", { name: "Buscar cliente" })
    .last()
    .fill(text);
}

test.describe("Detalle de clientes", () => {
  test.beforeEach(async ({ loginAs }) => {
    await loginAs("ventas");
  });

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

  test("abre el detalle desde el listado y la edición llega a Shopify", async ({
    page,
    request,
    makeAxeBuilder,
  }) => {
    await page.goto("/clientes");
    await page.getByRole("button", { name: "Nuevo cliente" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("tab", { name: "Empresa" }).click();
    await dialog.getByLabel("Razón social").fill(legalName);
    await dialog.getByLabel("RUC").fill(randomRuc());
    await dialog.getByLabel("Teléfono").fill("(01) 234-5678");
    await dialog.getByRole("button", { name: "Registrar empresa" }).click();
    const fila = page.getByTestId(`cliente-${legalName}`);
    await expect(fila.getByTestId("estado-shopify")).toHaveText(
      "Shopify: Sincronizado",
      { timeout: 20_000 },
    );

    await fila.getByRole("link", { name: legalName }).click();
    // La primera vez el servidor de desarrollo compila la página del detalle.
    await expect(page).toHaveURL(/\/clientes\/[0-9a-f-]{36}$/, {
      timeout: 30_000,
    });
    detailUrl = new URL(page.url()).pathname;
    await expect(page.getByRole("heading", { name: legalName })).toBeVisible();

    await page.getByRole("button", { name: "Editar" }).click();
    const edit = page.getByRole("dialog");
    await edit.getByLabel("Teléfono").fill("(054) 234567");
    await edit.getByLabel("Ciudad").fill("Cayma");
    await edit.getByLabel("Región").click();
    await page.getByRole("option", { name: "Arequipa" }).click();
    await edit.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(
      page.getByText("Cambios guardados. Se actualizarán en Shopify."),
    ).toBeVisible();
    await expect(page.getByText("Cayma, Arequipa")).toBeVisible();

    await expect
      .poll(
        async () =>
          (await shopifyCompanies(request)).find((c) => c.name === legalName),
        { timeout: 20_000 },
      )
      .toMatchObject({
        phone: "+5154234567",
        address: { city: "Cayma", zoneCode: "ARE" },
      });
    await expect(
      page.getByRole("heading", { name: "Historial de cambios" }),
    ).toBeVisible();

    const results = await makeAxeBuilder().analyze();
    expect(
      results.violations.filter((v) =>
        ["critical", "serious"].includes(v.impact ?? ""),
      ),
    ).toEqual([]);
  });

  test("agrega un contacto y luego lo encuentra en el buscador", async ({
    page,
  }) => {
    await page.goto(detailUrl);
    await page.getByRole("button", { name: "Agregar contacto" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Nombres").fill(`Contacto${run}`);
    await dialog.getByLabel("Apellidos").fill("Prueba");
    await dialog.getByLabel("Cargo").fill("Compras");
    await dialog.getByLabel("Teléfono").fill(`9${digits(8)}`);
    await dialog.getByRole("button", { name: "Agregar contacto" }).click();
    const contacto = page.getByTestId(`contacto-${contactName}`);
    await expect(contacto).toContainText("Compras");
    await expect(contacto.getByTestId("estado-shopify")).toHaveText(
      "Shopify: Sincronizado",
      { timeout: 20_000 },
    );

    await page.goto("/clientes");
    await openSearch(page, `Contacto${run}`);
    const option = page.getByRole("option", { name: new RegExp(contactName) });
    await expect(option).toContainText(`Contacto de ${legalName}`);
    await option.click();
    await expect(page).toHaveURL(detailUrl);
  });

  test("un cambio hecho en Shopify actualiza el contacto (P16)", async ({
    page,
    request,
  }) => {
    const admin = adminClient();
    const { data: contact } = await admin
      .from("contacts")
      .select("id, shopify_customer_id, phone")
      .eq("first_name", `Contacto${run}`)
      .single();
    const body = JSON.stringify({
      admin_graphql_api_id: contact!.shopify_customer_id,
      first_name: `Contacto${run}`,
      last_name: "Cambiado",
      email: `contacto${run}@andina.pe`,
      phone: contact!.phone,
    });
    const response = await request.post("/api/webhooks/shopify", {
      data: body,
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Topic": "customers/update",
        "X-Shopify-Shop-Domain": FAKE_SHOP_DOMAIN,
        "X-Shopify-Webhook-Id": `e2e-detalle-${run}`,
        "X-Shopify-Hmac-Sha256": signWebhook(body, FAKE_WEBHOOK_SECRET),
      },
    });
    expect(response.status()).toBe(200);

    await page.goto(detailUrl);
    await expect(
      page.getByTestId(`contacto-Contacto${run} Cambiado`),
    ).toContainText(`contacto${run}@andina.pe`, { timeout: 10_000 });
    // El cambio no vuelve a Shopify.
    const { count } = await admin
      .from("shopify_sync_jobs")
      .select("id", { count: "exact", head: true })
      .eq("entity_id", contact!.id)
      .eq("kind", "contact.update");
    expect(count).toBe(0);
    await admin
      .from("shopify_webhook_events")
      .delete()
      .eq("webhook_id", `e2e-detalle-${run}`);
  });

  test("filtra el listado por texto y tipo", async ({ page }) => {
    await page.goto("/clientes");
    await page
      .getByLabel("Nombre, documento, teléfono o email")
      .fill(`Detalle ${run}`);
    await page.getByLabel("Tipo").click();
    await page.getByRole("option", { name: "Empresas" }).click();
    await page.getByRole("button", { name: "Filtrar" }).click();
    await expect(page).toHaveURL(/tipo=empresa/);
    await expect(page.getByTestId(`cliente-${legalName}`)).toBeVisible();
    await expect(page.getByText("1 cliente · Página 1 de 1")).toBeVisible();

    await page.getByLabel("Tipo").click();
    await page.getByRole("option", { name: "Personas" }).click();
    await page.getByRole("button", { name: "Filtrar" }).click();
    await expect(
      page.getByText("No hay clientes con esos filtros."),
    ).toBeVisible();
  });

  test("logística ve los datos y contactos, sin editar ni ver el historial", async ({
    page,
    loginAs,
  }) => {
    await loginAs("logistica");
    await page.goto(detailUrl);
    await expect(page.getByRole("heading", { name: legalName })).toBeVisible();
    await expect(page.getByText("Cayma, Arequipa")).toBeVisible();
    await expect(
      page.getByTestId(`contacto-Contacto${run} Cambiado`),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Editar" })).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Agregar contacto" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Historial de cambios" }),
    ).toHaveCount(0);
  });

  test("desactivar la empresa la saca del listado de activos", async ({
    page,
  }) => {
    await page.goto(detailUrl);
    await page.getByRole("button", { name: `Desactivar ${legalName}` }).click();
    await expect(page.getByText(`${legalName} fue desactivado.`)).toBeVisible();
    await expect(page.getByRole("heading", { name: legalName })).toContainText(
      "Inactivo",
    );

    await page.goto(`/clientes?q=${encodeURIComponent(`Detalle ${run}`)}`);
    await expect(
      page.getByText("No hay clientes con esos filtros."),
    ).toBeVisible();
    await page.goto(
      `/clientes?q=${encodeURIComponent(`Detalle ${run}`)}&estado=inactivos`,
    );
    await expect(page.getByTestId(`cliente-${legalName}`)).toContainText(
      "Inactivo",
    );
  });

  test("un id inexistente muestra 404", async ({ page }) => {
    const response = await page.goto("/clientes/no-existe");
    expect(response?.status()).toBe(404);
  });
});
