import { expect, test } from "./fixtures";
import { adminClient } from "./support/supabase";

const unique = (prefix: string) =>
  `${prefix} ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

test.describe("Catálogos", () => {
  const created: {
    table: "materials" | "services" | "payment_methods";
    name: string;
  }[] = [];

  test.afterAll(async () => {
    for (const { table, name } of created) {
      await adminClient().from(table).delete().ilike("name", name);
    }
  });

  test("el admin agrega, edita y desactiva un servicio con precio sugerido", async ({
    page,
    loginAs,
    makeAxeBuilder,
  }) => {
    await loginAs("admin");
    const name = unique("Soldadura E2E");
    created.push({ table: "services", name });

    await page.goto("/configuracion");
    await page
      .getByRole("navigation", { name: "Secciones de configuración" })
      .getByRole("link", { name: "Servicios" })
      .click();
    await expect(page).toHaveURL(/\/configuracion\/servicios$/);

    await page.getByRole("button", { name: "Agregar" }).click();
    let dialog = page.getByRole("dialog");
    await dialog.getByLabel("Nombre").fill(name);
    await dialog.getByLabel("Precio sugerido (S/)").fill("45,5");
    await dialog.getByRole("button", { name: "Agregar" }).click();
    const item = page.getByTestId(`catalogo-${name}`);
    await expect(item).toContainText("S/ 45.50");

    await item.getByRole("button", { name: `Editar ${name}` }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("Precio sugerido (S/)").fill("50");
    await dialog.getByRole("button", { name: "Guardar" }).click();
    await expect(item).toContainText("S/ 50.00");

    await item.getByRole("button", { name: "Desactivar" }).click();
    await expect(item).toContainText("Inactivo");

    await page.reload();
    await expect(item).toContainText("S/ 50.00");
    await expect(item).toContainText("Inactivo");

    const results = await makeAxeBuilder().analyze();
    expect(
      results.violations.filter((v) =>
        ["critical", "serious"].includes(v.impact ?? ""),
      ),
    ).toEqual([]);
  });

  test("el admin elimina un material que nadie usa", async ({
    page,
    loginAs,
  }) => {
    await loginAs("admin");
    const name = unique("Cobre E2E");
    created.push({ table: "materials", name });

    await page.goto("/configuracion/materiales");
    await page.getByRole("button", { name: "Agregar" }).click();
    let dialog = page.getByRole("dialog");
    await dialog.getByLabel("Nombre").fill(name);
    await dialog.getByRole("button", { name: "Agregar" }).click();
    const item = page.getByTestId(`catalogo-${name}`);
    await expect(item).toBeVisible();

    await item.getByRole("button", { name: `Eliminar ${name}` }).click();
    dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(`¿Eliminar "${name}"?`);
    await dialog.getByRole("button", { name: "Eliminar" }).click();
    await expect(item).toHaveCount(0);

    await page.reload();
    await expect(page.getByTestId(`catalogo-${name}`)).toHaveCount(0);
  });

  test("un servicio en uso no se elimina: el aviso sugiere desactivarlo", async ({
    page,
    loginAs,
  }) => {
    const admin = adminClient();
    const name = unique("Dorado E2E");
    created.push({ table: "services", name });
    const { data: service, error } = await admin
      .from("services")
      .insert({ name })
      .select("id")
      .single();
    if (error) throw error;
    const { data: client, error: clientError } = await admin
      .from("clients")
      .insert({
        kind: "persona",
        first_name: unique("Catalogo"),
        // Ya sincronizado: no encola trabajo para el Shopify falso.
        shopify_customer_id: `gid://shopify/Customer/c${Date.now()}`,
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
        description: "Pieza que usa el servicio",
        service_id: service.id,
        price: 10,
        // El código y el número los pone un trigger.
      } as never);
      if (pieceError) throw pieceError;

      await loginAs("admin");
      await page.goto("/configuracion/servicios");
      const item = page.getByTestId(`catalogo-${name}`);
      await item.getByRole("button", { name: `Eliminar ${name}` }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("button", { name: "Eliminar" }).click();
      await expect(dialog.getByRole("alert")).toContainText(
        `“${name}” está en uso en 1 pieza. Desactívalo en su lugar.`,
      );
      await dialog.getByRole("button", { name: "Cancelar" }).click();
      await expect(item).toBeVisible();

      // Lo que sí se puede es desactivarlo.
      await item.getByRole("button", { name: "Desactivar" }).click();
      await expect(item).toContainText("Inactivo");
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

  test("los métodos de pago iniciales están cargados y no se repiten nombres", async ({
    page,
    loginAs,
  }) => {
    await loginAs("admin");
    await page.goto("/configuracion/metodos-de-pago");
    for (const metodo of ["Efectivo", "Tarjeta", "Yape", "Plin"]) {
      await expect(page.getByTestId(`catalogo-${metodo}`)).toBeVisible();
    }
    await page.getByRole("button", { name: "Agregar" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Nombre", { exact: true }).fill("yape");
    await dialog.getByRole("button", { name: "Agregar" }).click();
    await expect(
      dialog.getByText("Ya existe un ítem con ese nombre."),
    ).toBeVisible();
    await page.keyboard.press("Escape");

    // Nombre del método de pago manual en Shopify (D34), opcional.
    const tarjeta = page.getByTestId("catalogo-Tarjeta");
    await tarjeta.getByRole("button", { name: "Editar Tarjeta" }).click();
    await dialog.getByLabel("Nombre en Shopify").fill("Visa");
    await dialog.getByRole("button", { name: "Guardar" }).click();
    // Columna "Nombre en Shopify" de la tabla.
    await expect(tarjeta).toContainText("Visa");
    await tarjeta.getByRole("button", { name: "Editar Tarjeta" }).click();
    await dialog.getByLabel("Nombre en Shopify").fill("");
    await dialog.getByRole("button", { name: "Guardar" }).click();
    await expect(tarjeta).not.toContainText("Visa");
  });

  test("el admin elimina un método de pago sin pagos; uno con pagos solo se desactiva", async ({
    page,
    loginAs,
  }) => {
    await loginAs("admin");
    const name = unique("Transferencia E2E");
    created.push({ table: "payment_methods", name });

    await page.goto("/configuracion/metodos-de-pago");
    await page.getByRole("button", { name: "Agregar" }).click();
    let dialog = page.getByRole("dialog");
    await dialog.getByLabel("Nombre", { exact: true }).fill(name);
    await dialog.getByRole("button", { name: "Agregar" }).click();
    const item = page.getByTestId(`catalogo-${name}`);
    await expect(item).toBeVisible();

    await item.getByRole("button", { name: `Eliminar ${name}` }).click();
    dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(`¿Eliminar "${name}"?`);
    await dialog.getByRole("button", { name: "Eliminar" }).click();
    await expect(item).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId(`catalogo-${name}`)).toHaveCount(0);

    // Yape tiene pagos en los datos de prueba: el aviso pide desactivarlo.
    const yape = page.getByTestId("catalogo-Yape");
    await yape.getByRole("button", { name: "Eliminar Yape" }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Eliminar" }).click();
    await expect(dialog.getByRole("alert")).toContainText(
      /“Yape” está en uso en \d+ pagos?\. Desactívalo en su lugar\./,
    );
    await dialog.getByRole("button", { name: "Cancelar" }).click();
    await expect(yape).toBeVisible();
  });

  test("ventas no entra a los catálogos", async ({ page, loginAs }) => {
    await loginAs("ventas");
    for (const ruta of [
      "/configuracion/materiales",
      "/configuracion/servicios",
      "/configuracion/metodos-de-pago",
    ]) {
      const response = await page.goto(ruta);
      expect(response?.status()).toBe(403);
    }
  });

  test("agrega un material desde el celular @mobile", async ({
    page,
    loginAs,
    isMobile,
  }) => {
    test.skip(!isMobile, "Solo aplica al proyecto móvil");
    await loginAs("admin");
    const name = unique("Plata Móvil");
    created.push({ table: "materials", name });

    await page.goto("/configuracion/materiales");
    await page.getByRole("button", { name: "Agregar" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Nombre").fill(name);
    await dialog.getByRole("button", { name: "Agregar" }).click();
    await expect(page.getByTestId(`catalogo-movil-${name}`)).toBeVisible();
    const scrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    expect(scrollWidth).toBeLessThanOrEqual(
      page.viewportSize()?.width ?? Infinity,
    );
  });
});
