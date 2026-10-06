import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import { adminClient } from "./support/supabase";

// Comparten la cotización creada: en serie.
test.describe.configure({ mode: "serial" });

const run = `${Date.now()}`.slice(-6);
const clientName = `Wasap${run}`;
const pieceName = `Fuente ${run}`;
let quoteUrl = "";
let clientId = "";

async function pickClient(page: Page, text: string) {
  await page.getByRole("combobox", { name: "Cliente" }).click();
  await page
    .getByRole("combobox", { name: "Buscar cliente" })
    .last()
    .fill(text);
  await page
    .getByRole("option", { name: new RegExp(text) })
    .first()
    .click();
}

async function fillPiece(
  page: Page,
  index: number,
  piece: { description: string; price: string },
) {
  const card = page.getByTestId(`pieza-${index}`);
  await card.getByLabel("Descripción").fill(piece.description);
  await card.getByLabel("Precio (S/)").fill(piece.price);
}

test.describe("Cotizaciones de WhatsApp (P46)", () => {
  test.beforeAll(async () => {
    const { data, error } = await adminClient()
      .from("clients")
      .insert({
        kind: "persona",
        first_name: clientName,
        last_name: "Prueba",
        shopify_customer_id: `gid://shopify/Customer/w${run}`,
      })
      .select("id")
      .single();
    if (error) throw error;
    clientId = data.id;
  });

  test.afterAll(async () => {
    const admin = adminClient();
    const { data: quotes } = await admin
      .from("whatsapp_quotes")
      .select("id")
      .or(`client_id.eq.${clientId},customer_name.ilike.%${run}%`);
    const quoteIds = (quotes ?? []).map((q) => q.id);
    const { data: restorations } = await admin
      .from("restorations")
      .select("id")
      .eq("client_id", clientId);
    const ids = (restorations ?? []).map((r) => r.id);
    if (ids.length) {
      await admin.from("shopify_sync_jobs").delete().in("entity_id", ids);
      await admin.from("pieces").delete().in("restoration_id", ids);
      await admin.from("restorations").delete().in("id", ids);
    }
    if (quoteIds.length)
      await admin.from("whatsapp_quotes").delete().in("id", quoteIds);
    await admin.from("clients").delete().eq("id", clientId);
  });

  test("registra una cotización sin cliente y no aparece entre las restauraciones", async ({
    page,
    loginAs,
  }) => {
    await loginAs("ventas");
    await page.goto("/restauraciones/nueva");
    await page.getByLabel(/El pedido vino por WhatsApp/).check();
    await expect(
      page.getByTestId("pieza-1").getByLabel("La pieza ya está en tienda"),
    ).toHaveCount(0);
    await page.getByLabel("Nombre (opcional)").fill(`Ana ${run}`);
    await fillPiece(page, 1, { description: pieceName, price: "100" });
    await page.getByRole("button", { name: "Agregar pieza" }).click();
    await fillPiece(page, 2, { description: "Jarra", price: "60" });
    await page.getByRole("button", { name: "Agregar pieza" }).click();
    await fillPiece(page, 3, { description: "Candelabro", price: "40" });
    await page.getByRole("button", { name: "Registrar cotización" }).click();

    await expect(page).toHaveURL(
      /\/cotizaciones-whatsapp\/[0-9a-f-]{36}\?registrada=1$/,
      { timeout: 30_000 },
    );
    quoteUrl = new URL(page.url()).pathname;
    const mensaje = page.getByRole("dialog").getByTestId("mensaje-cotizacion");
    await expect(mensaje).toContainText(`Hola Ana ${run}`);
    await expect(mensaje).toContainText(/CWA-\d{5,}/);
    // Sin teléfono no hay "Abrir WhatsApp".
    await expect(
      page.getByRole("dialog").getByRole("link", { name: /Abrir WhatsApp/ }),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("estado-cotizacion")).toHaveText("Cotizada");

    // Nunca en la misma vista que las restauraciones.
    await page.goto(`/restauraciones?q=${run}`);
    await expect(page.getByText(pieceName)).toHaveCount(0);
    await page.goto(`/piezas?q=${pieceName}`);
    await expect(
      page.getByText("No hay piezas con esos filtros."),
    ).toBeVisible();
  });

  test("busca la cotización por la descripción de una pieza", async ({
    page,
    loginAs,
  }) => {
    await loginAs("ventas");
    await page.goto("/cotizaciones-whatsapp");
    await page
      .getByLabel("Código, cliente, teléfono o pieza cotizada")
      .fill(pieceName);
    await page.getByRole("button", { name: "Filtrar" }).click();
    await expect(page.getByText("1 cotización · Página 1 de 1")).toBeVisible();
  });

  test("crea una restauración con dos piezas y luego con la tercera", async ({
    page,
    loginAs,
  }) => {
    await loginAs("ventas");
    await page.goto(quoteUrl);
    await page.getByRole("link", { name: "Crear restauración" }).click();
    await expect(page).toHaveURL(/\/restauraciones\/nueva\?cotizacion=/);
    // El cliente es obligatorio: se elige uno.
    await page.getByLabel("Pedir Candelabro").uncheck();
    await page.getByRole("button", { name: "Crear restauración" }).click();
    await expect(page.getByText("Elige un cliente")).toBeVisible();
    await pickClient(page, clientName);
    await page.getByRole("button", { name: "Crear restauración" }).click();

    await expect(page).toHaveURL(/\/restauraciones\/[0-9a-f-]{36}/, {
      timeout: 30_000,
    });
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("estado-restauracion")).toHaveText(
      "Aprobada",
    );
    await expect(page.getByTestId("origen")).toContainText("WhatsApp");
    await expect(page.getByTestId("origen")).toContainText(/CWA-\d{5,}/);
    // Las piezas copiadas nacen "Por WhatsApp" hasta que llegan a la tienda (P48).
    const first = page.locator("[data-testid^='pieza-RES-']").first();
    await expect(first).toContainText("Por WhatsApp");
    await first
      .getByRole("button", { name: "Marcar llegada a tienda" })
      .click();
    await expect(first).toContainText("Sin enviar");

    await page.goto(quoteUrl);
    await expect(page.getByTestId("estado-cotizacion")).toHaveText(
      "Pedida en parte",
    );
    await expect(page.getByTestId("item-1")).toContainText(/Pedida en RES-/);
    await expect(page.getByTestId("item-3")).toContainText("Pendiente");
    // Ya se copió: no se edita.
    await expect(page.getByRole("link", { name: "Editar" })).toHaveCount(0);

    // Las copias siguientes usan el mismo cliente, ya vinculado.
    await page.getByRole("link", { name: "Crear restauración" }).click();
    await expect(page.getByTestId("cliente-fijo")).toContainText(clientName);
    await expect(page.getByLabel("Pedir Jarra")).toBeDisabled();
    await page.getByRole("button", { name: "Crear restauración" }).click();
    await expect(page).toHaveURL(/\/restauraciones\/[0-9a-f-]{36}/, {
      timeout: 30_000,
    });
    await page.goto(quoteUrl);
    await expect(page.getByTestId("estado-cotizacion")).toHaveText(
      "Pedida completa",
    );

    // En el cliente, en una pestaña aparte de las restauraciones.
    await page.goto(`/clientes/${clientId}`);
    await page.getByRole("tab", { name: /Cotizaciones de WhatsApp/ }).click();
    await expect(page.getByRole("tabpanel")).toContainText(/CWA-\d{5,}/);

    // Filtro por origen en el listado de restauraciones.
    await page.goto(`/restauraciones?q=${clientName}&origen=whatsapp`);
    await expect(page.getByText("2 restauraciones")).toBeVisible();
  });

  test("descarta y reabre una cotización", async ({ page, loginAs }) => {
    await loginAs("ventas");
    await page.goto("/restauraciones/nueva?whatsapp=1");
    await page.getByLabel("Nombre (opcional)").fill(`Descartable ${run}`);
    await fillPiece(page, 1, { description: "Plato", price: "10" });
    await page.getByRole("button", { name: "Registrar cotización" }).click();
    await expect(page).toHaveURL(/\/cotizaciones-whatsapp\/[0-9a-f-]{36}/, {
      timeout: 30_000,
    });
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Descartar" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Motivo (obligatorio)").fill("No respondió");
    await dialog.getByRole("button", { name: "Confirmar: Descartar" }).click();
    await expect(page.getByTestId("estado-cotizacion")).toHaveText(
      "Descartada",
    );
    await expect(
      page.getByRole("link", { name: "Crear restauración" }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Reabrir" }).click();
    await expect(page.getByTestId("estado-cotizacion")).toHaveText("Cotizada");
  });

  test("logística no ve las cotizaciones", async ({ page, loginAs }) => {
    await loginAs("logistica");
    await page.goto("/piezas");
    await expect(
      page.getByRole("link", { name: "Cotizaciones de WhatsApp" }),
    ).toHaveCount(0);
    const response = await page.goto(quoteUrl);
    expect(response?.status()).toBe(403);
  });
});
