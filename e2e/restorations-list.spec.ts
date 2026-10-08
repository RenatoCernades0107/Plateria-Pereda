import { readFile } from "node:fs/promises";

import { expect, test } from "./fixtures";
import { adminClient } from "./support/supabase";

// Comparten las restauraciones sembradas: en serie.
test.describe.configure({ mode: "serial" });

const run = `${Date.now()}`.slice(-6);
const clientName = `Listado${run}`;
let clientId = "";
const codes: string[] = [];

test.describe("Listado de restauraciones", () => {
  test.beforeAll(async () => {
    const admin = adminClient();
    const { data: client, error } = await admin
      .from("clients")
      .insert({
        kind: "persona",
        first_name: clientName,
        last_name: "Prueba",
        shopify_customer_id: `gid://shopify/Customer/l${run}`,
      })
      .select("id")
      .single();
    if (error) throw error;
    clientId = client.id;
    // 27 restauraciones: dos páginas de 25.
    const { data, error: insertError } = await admin
      .from("restorations")
      .insert(
        Array.from({ length: 27 }, () => ({
          client_id: clientId,
          payment_type: "contado" as const,
        })),
      )
      .select("id, code")
      .order("code");
    if (insertError) throw insertError;
    codes.push(...data.map((r) => r.code));
    await admin
      .from("restorations")
      .update({ status: "en_proceso", payment_status: "parcial" })
      .eq("id", data[0]!.id);
    await admin
      .from("restorations")
      .update({ status: "lista", payment_status: "pagado" })
      .eq("id", data[1]!.id);
  });

  test.afterAll(async () => {
    const admin = adminClient();
    await admin.from("restorations").delete().eq("client_id", clientId);
    await admin.from("clients").delete().eq("id", clientId);
  });

  test.beforeEach(async ({ loginAs }) => {
    await loginAs("ventas");
  });

  test("filtra por estado y por estado de pago, y la recarga conserva los filtros", async ({
    page,
  }) => {
    await page.goto("/restauraciones");
    await page.getByLabel("Código, cliente o documento").fill(clientName);
    await page.getByLabel("Estado", { exact: true }).click();
    await page.getByRole("option", { name: "En proceso" }).click();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Filtrar" }).click();
    await expect(page).toHaveURL(/estado=en_proceso/);
    await expect(page.getByTestId(`restauracion-${codes[0]}`)).toBeVisible();
    await expect(
      page.getByText("1 restauración · Página 1 de 1"),
    ).toBeVisible();

    await page.getByLabel("Estado", { exact: true }).click();
    await page.getByRole("button", { name: "Limpiar selección" }).click();
    await page.keyboard.press("Escape");
    await page.getByLabel("Estado de pago").click();
    await page.getByRole("option", { name: "Pagado" }).click();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Filtrar" }).click();
    await expect(page).toHaveURL(/pago=pagado/);
    await expect(page.getByTestId(`restauracion-${codes[1]}`)).toBeVisible();
    await expect(
      page.getByText("1 restauración · Página 1 de 1"),
    ).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Código, cliente o documento")).toHaveValue(
      clientName,
    );
    await expect(page.getByTestId(`restauracion-${codes[1]}`)).toBeVisible();
  });

  test("permite elegir varios estados en el mismo filtro y desplegar más filtros", async ({
    page,
  }) => {
    await page.goto("/restauraciones");
    await expect(page.getByLabel("Taller")).toHaveCount(0);
    await page.getByRole("button", { name: "Más filtros" }).click();
    await expect(page.getByLabel("Taller")).toBeVisible();

    await page.getByLabel("Código, cliente o documento").fill(clientName);
    await page.getByLabel("Estado", { exact: true }).click();
    await page.getByRole("option", { name: "En proceso" }).click();
    await page.getByRole("option", { name: "Lista", exact: true }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByLabel("Estado", { exact: true })).toContainText(
      "2 seleccionados",
    );
    await page.getByRole("button", { name: "Filtrar" }).click();
    await expect(page).toHaveURL(/estado=en_proceso&estado=lista/);
    await expect(page.getByTestId(`restauracion-${codes[0]}`)).toBeVisible();
    await expect(page.getByTestId(`restauracion-${codes[1]}`)).toBeVisible();
    await expect(
      page.getByText("2 restauraciones · Página 1 de 1"),
    ).toBeVisible();
  });

  test("busca por código", async ({ page }) => {
    await page.goto("/restauraciones");
    await page.getByLabel("Código, cliente o documento").fill(codes[5]!);
    await page.getByRole("button", { name: "Filtrar" }).click();
    await expect(page.getByTestId(`restauracion-${codes[5]}`)).toBeVisible();
    await expect(
      page.getByText("1 restauración · Página 1 de 1"),
    ).toBeVisible();
  });

  test("pagina y ordena por código", async ({ page }) => {
    await page.goto(`/restauraciones?q=${clientName}&orden=code&dir=asc`);
    await expect(
      page.getByText("27 restauraciones · Página 1 de 2"),
    ).toBeVisible();
    await expect(page.getByTestId(`restauracion-${codes[0]}`)).toBeVisible();
    await page.getByRole("link", { name: "Siguiente" }).click();
    await expect(
      page.getByText("27 restauraciones · Página 2 de 2"),
    ).toBeVisible();
    await expect(page.getByTestId(`restauracion-${codes[26]}`)).toBeVisible();
    await expect(page.getByTestId(`restauracion-${codes[0]}`)).toHaveCount(0);
  });

  test("exporta a CSV con los filtros", async ({ page }) => {
    await page.goto(`/restauraciones?q=${clientName}&estado=lista`);
    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "Exportar CSV" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(
      /^restauraciones-\d{4}-\d{2}-\d{2}\.csv$/,
    );
    const text = await readFile((await file.path())!, "utf8");
    expect(text).toContain(codes[1]);
    expect(text).not.toContain(codes[0]);
    expect(text).toContain("Pagado");
  });

  test("logística no ve montos, pagos ni exportación", async ({
    page,
    loginAs,
  }) => {
    await loginAs("logistica");
    await page.goto(`/restauraciones?q=${clientName}`);
    await expect(page.getByTestId(`restauracion-${codes[0]}`)).toBeVisible();
    await expect(page.getByLabel("Estado de pago")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Exportar CSV" })).toHaveCount(
      0,
    );
    await expect(page.getByRole("columnheader", { name: /Total/ })).toHaveCount(
      0,
    );
    const response = await page.request.get("/api/restauraciones/exportar");
    expect(response.status()).toBe(403);
  });

  test("vista de tarjetas en el celular @mobile", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "Solo aplica al proyecto móvil");
    await page.goto(`/restauraciones?q=${codes[0]}`);
    await expect(
      page.getByTestId(`restauracion-movil-${codes[0]}`),
    ).toContainText("En proceso");
    const scrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    expect(scrollWidth).toBeLessThanOrEqual(
      page.viewportSize()?.width ?? Infinity,
    );

    // El kanban se desplaza dentro de su contenedor, no la página.
    await page.goto(`/restauraciones?q=${codes[0]}&vista=kanban`);
    await expect(page.getByTestId(`tarjeta-${codes[0]}`)).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(page.viewportSize()?.width ?? Infinity);
  });
  test("cambia a kanban por estado y la vista queda en la URL", async ({
    page,
  }) => {
    await page.goto(`/restauraciones?q=${clientName}`);
    await page
      .getByRole("navigation", { name: "Vista" })
      .getByRole("link", { name: "Kanban" })
      .click();
    await expect(page).toHaveURL(/vista=kanban/);
    await expect(
      page.getByTestId("columna-en_proceso").getByTestId(`tarjeta-${codes[0]}`),
    ).toBeVisible();
    await expect(
      page.getByTestId("columna-lista").getByTestId(`tarjeta-${codes[1]}`),
    ).toBeVisible();
    await expect(page.getByTestId("columna-registrada")).toContainText("25");
    await expect(
      page.getByRole("navigation", { name: "Paginación" }),
    ).toHaveCount(0);

    // Filtrar mantiene la vista kanban.
    await page.getByLabel("Estado", { exact: true }).click();
    await page.getByRole("option", { name: "Lista", exact: true }).click();
    await page.getByRole("button", { name: "Filtrar" }).click();
    await expect(page).toHaveURL(/estado=lista.*vista=kanban/);
    await expect(page.getByTestId(`tarjeta-${codes[1]}`)).toBeVisible();
    await expect(page.getByTestId(`tarjeta-${codes[0]}`)).toHaveCount(0);

    await page
      .getByRole("navigation", { name: "Vista" })
      .getByRole("link", { name: "Tabla" })
      .click();
    await expect(page).not.toHaveURL(/vista=/);
    await expect(page.getByTestId(`restauracion-${codes[1]}`)).toBeVisible();
  });
});
