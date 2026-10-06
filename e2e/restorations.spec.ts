import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import { adminClient } from "./support/supabase";

// Comparten el cliente y la restauración creados: en serie.
test.describe.configure({ mode: "serial" });

const run = `${Date.now()}`.slice(-6);
const clientName = `Restaura${run}`;
const phone = `+5194${run}0`;
let detailUrl = "";
const clientIds: string[] = [];

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
  piece: { description: string; service?: string; price: string },
) {
  const card = page.getByTestId(`pieza-${index}`);
  await card.getByLabel("Descripción").fill(piece.description);
  if (piece.service) await card.getByLabel("Servicio").fill(piece.service);
  await card.getByLabel("Precio (S/)").fill(piece.price);
}

test.describe("Restauraciones", () => {
  test.beforeAll(async () => {
    const { data, error } = await adminClient()
      .from("clients")
      .insert({
        kind: "persona",
        first_name: clientName,
        last_name: "Prueba",
        phone,
        // Ya sincronizado: no encola trabajo para el Shopify falso.
        shopify_customer_id: `gid://shopify/Customer/r${run}`,
      })
      .select("id")
      .single();
    if (error) throw error;
    clientIds.push(data.id);
  });

  test.afterAll(async () => {
    const admin = adminClient();
    const { data } = await admin
      .from("restorations")
      .select("id")
      .in("client_id", clientIds);
    const ids = (data ?? []).map((r) => r.id);
    if (ids.length) {
      await admin.from("pieces").delete().in("restoration_id", ids);
      await admin.from("restorations").delete().in("id", ids);
    }
    const { data: nuevos } = await admin
      .from("clients")
      .select("id")
      .eq("first_name", `Nuevo${run}`);
    await admin
      .from("clients")
      .delete()
      .in("id", [...clientIds, ...(nuevos ?? []).map((c) => c.id)]);
  });

  test.beforeEach(async ({ loginAs }) => {
    await loginAs("ventas");
  });

  test("registra una restauración con 3 piezas y muestra la cotización", async ({
    page,
    context,
    makeAxeBuilder,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/restauraciones");
    await page.getByRole("link", { name: "Nueva restauración" }).click();
    await expect(
      page.getByRole("heading", { name: "Nueva restauración" }),
    ).toBeVisible();

    await pickClient(page, clientName);
    await fillPiece(page, 1, {
      description: "Fuente ovalada abollada",
      service: "Restauración completa",
      price: "1,200.50",
    });
    // P20: la casilla viene marcada; esta pieza llega después.
    await page
      .getByTestId("pieza-1")
      .getByLabel("La pieza ya está en tienda")
      .uncheck();
    await page.getByRole("button", { name: "Duplicar pieza 1" }).click();
    await page
      .getByTestId("pieza-2")
      .getByLabel("Descripción")
      .fill("Fuente gemela");
    await page.getByRole("button", { name: "Agregar pieza" }).click();
    await fillPiece(page, 3, { description: "Cucharita", price: "35" });
    await page
      .getByTestId("pieza-3")
      .getByLabel("La pieza ya está en tienda")
      .check();

    await expect(page.getByTestId("total-en-vivo")).toHaveText("S/ 2,436.00");
    await expect(page.getByTestId("adelanto-en-vivo")).toHaveText(
      "S/ 1,218.00",
    );

    await page.getByRole("button", { name: "Registrar restauración" }).click();
    await expect(page).toHaveURL(
      /\/restauraciones\/[0-9a-f-]{36}\?registrada=1$/,
      {
        timeout: 30_000,
      },
    );
    detailUrl = new URL(page.url()).pathname;

    const dialog = page.getByRole("dialog");
    const mensaje = dialog.getByTestId("mensaje-cotizacion");
    await expect(mensaje).toContainText(/RES-\d{5,}/);
    await expect(mensaje).toContainText("2,436.00");
    await expect(mensaje).not.toContainText("Cucharita anulada");
    const link = dialog.getByRole("link", { name: /Abrir WhatsApp/ });
    await expect(link).toHaveAttribute(
      "href",
      new RegExp(`^https://wa\\.me/${phone.slice(1)}\\?text=`),
    );
    await dialog.getByRole("button", { name: "Copiar" }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
      "2,436.00",
    );
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(detailUrl);

    const code = (await page.getByRole("heading", { level: 1 }).textContent())!;
    expect(code).toMatch(/^RES-\d{5,}$/);
    await expect(page.getByTestId("monto-total")).toContainText("2,436.00");
    await expect(page.getByTestId(`pieza-${code}-3`)).toContainText(
      "En tienda",
    );
    await expect(page.getByTestId(`pieza-${code}-1`)).toContainText(
      "Sin enviar",
    );

    const results = await makeAxeBuilder().analyze();
    expect(
      results.violations.filter((v) =>
        ["critical", "serious"].includes(v.impact ?? ""),
      ),
    ).toEqual([]);
  });

  test("las validaciones impiden enviar datos incompletos", async ({
    page,
  }) => {
    await page.goto("/restauraciones/nueva");
    await page.getByRole("button", { name: "Registrar restauración" }).click();
    await expect(page.getByText("Elige un cliente")).toBeVisible();
    await expect(
      page.getByText("Describe la pieza (qué es y cómo está)"),
    ).toBeVisible();
    await expect(page.getByText("Ingresa el precio")).toBeVisible();
    await expect(page).toHaveURL(/\/restauraciones\/nueva$/);
  });

  test("crea un cliente nuevo desde el formulario sin perder lo escrito", async ({
    page,
  }) => {
    await page.goto("/restauraciones/nueva");
    await fillPiece(page, 1, { description: "Bandeja con asas", price: "80" });
    await page.getByRole("combobox", { name: "Cliente" }).click();
    await page.getByRole("option", { name: "Crear nuevo cliente" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Nombres").fill(`Nuevo${run}`);
    await dialog.getByLabel("Apellidos").fill("Desde Restauración");
    await dialog.getByLabel("Teléfono").fill(`9${run}12`);
    await dialog.getByRole("button", { name: "Registrar persona" }).click();

    await expect(page.getByRole("combobox", { name: "Cliente" })).toContainText(
      `Nuevo${run} Desde Restauración`,
    );
    await expect(
      page.getByTestId("pieza-1").getByLabel("Descripción"),
    ).toHaveValue("Bandeja con asas");
  });

  test("edita la restauración y sus piezas antes de la orden, y agrega una pieza", async ({
    page,
  }) => {
    await page.goto(detailUrl);
    const code = (await page.getByRole("heading", { level: 1 }).textContent())!;

    await page.getByRole("button", { name: `Editar pieza ${code}-1` }).click();
    let dialog = page.getByRole("dialog");
    await dialog.getByLabel("Descripción").fill("Fuente ovalada restaurada");
    await dialog.getByLabel("Precio (S/)").fill("1300");
    await dialog.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page.getByText("Pieza actualizada.")).toBeVisible();
    await expect(page.getByTestId(`pieza-${code}-1`)).toContainText(
      "Fuente ovalada restaurada",
    );
    await expect(page.getByTestId("monto-total")).toContainText("2,535.50");

    await page.getByRole("button", { name: "Editar", exact: true }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("Notas").fill("Entregar antes de Navidad");
    await dialog.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page.getByText("Restauración actualizada.")).toBeVisible();
    await expect(page.getByText("Entregar antes de Navidad")).toBeVisible();

    await page.getByRole("button", { name: "Agregar pieza" }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("Descripción").fill("Azucarera");
    await dialog.getByLabel("Precio (S/)").fill("64.50");
    await dialog.getByRole("button", { name: "Agregar pieza" }).click();
    await expect(page.getByTestId(`pieza-${code}-4`)).toContainText(
      "Azucarera",
    );
    await expect(page.getByTestId("monto-total")).toContainText("2,600.00");

    await page.getByRole("tab", { name: "Historial" }).click();
    await expect(
      page.getByText("Entregar antes de Navidad").last(),
    ).toBeVisible();
  });

  test("con la orden creada se edita el material pero no el precio (P12)", async ({
    page,
  }) => {
    const id = detailUrl.split("/").pop()!;
    // La orden la crea la Fase 9; aquí se simula.
    await adminClient()
      .from("restorations")
      .update({
        shopify_order_id: `gid://shopify/Order/e2e${run}`,
        shopify_order_name: `#E2E${run}`,
      })
      .eq("id", id);
    await page.goto(detailUrl);
    const code = (await page.getByRole("heading", { level: 1 }).textContent())!;
    await page.getByRole("button", { name: `Editar pieza ${code}-2` }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Precio (S/)")).toBeDisabled();
    await expect(
      dialog.getByText("solo el administrador cambia el precio"),
    ).toBeVisible();
    await dialog.getByLabel("Material").fill("Plata 925");
    await dialog.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page.getByTestId(`pieza-${code}-2`)).toContainText(
      "Material: Plata 925",
    );
  });

  test("logística ve el detalle sin precios, pagos ni historial", async ({
    page,
    loginAs,
  }) => {
    await loginAs("logistica");
    await page.goto(detailUrl);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^RES-/);
    await expect(page.getByText("Fuente ovalada restaurada")).toBeVisible();
    await expect(page.getByTestId("monto-total")).toHaveCount(0);
    await expect(page.getByText("1,300.00")).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "Pagos" })).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "Historial" })).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Mensaje de cotización" }),
    ).toHaveCount(0);
  });

  test("logística no abre restauraciones entregadas o anuladas", async ({
    page,
    loginAs,
  }) => {
    const id = detailUrl.split("/").pop()!;
    await adminClient()
      .from("restorations")
      .update({ status: "completada" })
      .eq("id", id);
    await loginAs("logistica");
    const response = await page.goto(detailUrl);
    expect(response?.status()).toBe(404);
  });

  test("registra una restauración desde el celular @mobile", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "Solo aplica al proyecto móvil");
    await page.goto("/restauraciones/nueva");
    await pickClient(page, clientName);
    await fillPiece(page, 1, { description: "Anillo de plata", price: "45" });
    await page.getByLabel("Tipo de pago").click();
    await page.getByRole("option", { name: "Al contado" }).click();
    await expect(page.getByTestId("adelanto-en-vivo")).toHaveText("S/ 45.00");
    await page.getByRole("button", { name: "Registrar restauración" }).click();
    await expect(page).toHaveURL(/\/restauraciones\/[0-9a-f-]{36}/, {
      timeout: 30_000,
    });
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("monto-total")).toContainText("45.00");
    const scrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    expect(scrollWidth).toBeLessThanOrEqual(
      page.viewportSize()?.width ?? Infinity,
    );
  });
});
