import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import { adminClient } from "./support/supabase";

const unique = (prefix: string) =>
  `${prefix} ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

async function createWorkshop(page: Page, name: string, phone = "") {
  await page.getByRole("button", { name: "Nuevo taller" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nombre").fill(name);
  if (phone) await dialog.getByLabel("Teléfono").fill(phone);
  await dialog.getByRole("button", { name: "Crear taller" }).click();
}

test.describe("Talleres", () => {
  const created: string[] = [];

  test.beforeEach(async ({ loginAs }) => {
    await loginAs("logistica");
  });

  test.afterAll(async () => {
    // Logística no los borra (solo el admin); los de prueba se limpian con la clave secreta.
    for (const name of created) {
      await adminClient().from("workshops").delete().ilike("name", name);
    }
  });

  test("logística crea, edita y desactiva un taller", async ({
    page,
    makeAxeBuilder,
  }) => {
    const name = unique("Taller E2E");
    const renamed = `${name} Norte`;
    created.push(name, renamed);

    await page.goto("/talleres");
    await createWorkshop(page, name, "999 111 222");
    await expect(page.getByText(`Taller "${name}" creado.`)).toBeVisible();
    let fila = page.getByTestId(`taller-${name}`);
    await expect(fila).toContainText("999 111 222");
    await expect(fila).toContainText("Activo");

    await fila.getByRole("button", { name: `Editar ${name}` }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Nombre").fill(renamed);
    await dialog.getByLabel("Persona de contacto").fill("Don José");
    await dialog.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Taller actualizado.")).toBeVisible();
    fila = page.getByTestId(`taller-${renamed}`);
    await expect(fila).toContainText("Don José · 999 111 222");

    await fila.getByRole("button", { name: "Desactivar" }).click();
    await expect(page.getByText(`${renamed} fue desactivado.`)).toBeVisible();
    await expect(fila).toContainText("Inactivo");
    await expect(fila.getByRole("button", { name: "Activar" })).toBeVisible();
    // Borrar talleres es solo del admin.
    await expect(fila.getByRole("button", { name: /Eliminar/ })).toHaveCount(0);

    const results = await makeAxeBuilder().analyze();
    expect(
      results.violations.filter((v) =>
        ["critical", "serious"].includes(v.impact ?? ""),
      ),
    ).toEqual([]);
  });

  test("un nombre duplicado muestra un error", async ({ page }) => {
    const name = unique("Taller Duplicado");
    created.push(name);

    await page.goto("/talleres");
    await createWorkshop(page, name);
    await expect(page.getByText(`Taller "${name}" creado.`)).toBeVisible();

    await createWorkshop(page, name.toUpperCase());
    await expect(
      page.getByRole("dialog").getByText("Ya existe un taller con ese nombre."),
    ).toBeVisible();
  });

  test("crea un taller desde el celular @mobile", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "Solo aplica al proyecto móvil");
    const name = unique("Taller Móvil");
    created.push(name);

    await page.goto("/talleres");
    await createWorkshop(page, name, "988 777 666");
    const tarjeta = page.getByTestId(`taller-movil-${name}`);
    await expect(tarjeta).toContainText("988 777 666");
    const scrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    expect(scrollWidth).toBeLessThanOrEqual(
      page.viewportSize()?.width ?? Infinity,
    );
  });
});

test.describe("Talleres: eliminar (admin)", () => {
  const created: string[] = [];

  test.beforeEach(async ({ loginAs }) => {
    await loginAs("admin");
  });

  test.afterAll(async () => {
    for (const name of created) {
      await adminClient().from("workshops").delete().ilike("name", name);
    }
  });

  test("el admin elimina un taller que ninguna pieza usó", async ({ page }) => {
    const name = unique("Taller Borrar");
    created.push(name);

    await page.goto("/talleres");
    await createWorkshop(page, name);
    const fila = page.getByTestId(`taller-${name}`);
    await expect(fila).toBeVisible();

    await fila.getByRole("button", { name: `Eliminar ${name}` }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(`¿Eliminar "${name}"?`);
    await dialog.getByRole("button", { name: "Eliminar" }).click();
    await expect(page.getByText(`"${name}" fue eliminado.`)).toBeVisible();
    await expect(fila).toHaveCount(0);

    await page.reload();
    await expect(page.getByTestId(`taller-${name}`)).toHaveCount(0);
  });

  test("un taller con piezas no se elimina: el aviso sugiere desactivarlo", async ({
    page,
  }) => {
    const admin = adminClient();
    const name = unique("Taller En Uso");
    created.push(name);
    const { data: workshop, error } = await admin
      .from("workshops")
      .insert({ name })
      .select("id")
      .single();
    if (error) throw error;
    const { data: client, error: clientError } = await admin
      .from("clients")
      .insert({
        kind: "persona",
        first_name: unique("Taller"),
        // Ya sincronizado: no encola trabajo para el Shopify falso.
        shopify_customer_id: `gid://shopify/Customer/t${Date.now()}`,
      })
      .select("id")
      .single();
    if (clientError) throw clientError;

    try {
      const { data: restoration, error: restorationError } = await admin
        .from("restorations")
        .insert({ client_id: client.id, payment_type: "contado" })
        .select("id")
        .single();
      if (restorationError) throw restorationError;
      const { error: pieceError } = await admin.from("pieces").insert({
        restoration_id: restoration.id,
        description: "Pieza del taller",
        workshop_id: workshop.id,
        price: 10,
        // El código y el número los pone un trigger.
      } as never);
      if (pieceError) throw pieceError;

      await page.goto("/talleres");
      const fila = page.getByTestId(`taller-${name}`);
      await fila.getByRole("button", { name: `Eliminar ${name}` }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("button", { name: "Eliminar" }).click();
      await expect(dialog.getByRole("alert")).toContainText(
        `“${name}” está en uso en 1 pieza. Desactívalo en su lugar.`,
      );
      await dialog.getByRole("button", { name: "Cancelar" }).click();
      await expect(fila).toBeVisible();

      // Lo que sí se puede es desactivarlo.
      await fila.getByRole("button", { name: "Desactivar" }).click();
      await expect(fila).toContainText("Inactivo");
    } finally {
      const { data: restorations } = await admin
        .from("restorations")
        .select("id")
        .eq("client_id", client.id);
      const ids = (restorations ?? []).map((r) => r.id);
      if (ids.length) {
        await admin.from("pieces").delete().in("restoration_id", ids);
        await admin.from("restorations").delete().in("id", ids);
      }
      await admin.from("clients").delete().eq("id", client.id);
    }
  });
});
