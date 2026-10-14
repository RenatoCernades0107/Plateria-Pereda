import { expect, test } from "./fixtures";
import { dragWithMouse } from "./support/drag";
import { adminClient } from "./support/supabase";

// Comparten el cliente y la restauración sembrados: en serie.
test.describe.configure({ mode: "serial" });

const run = `${Date.now()}`.slice(-6);
let clientId = "";
let restoration = { id: "", code: "" };
/** Códigos de las piezas (p. ej. RES-00012-1). */
let approvedCode = "";
let newCode = "";
/** Piezas registradas que se mueven a Consulta (arrastrando) y con el teclado. */
let consultCode = "";
let keyboardCode = "";

test.describe("Kanban de piezas en el detalle de la restauración", () => {
  test.beforeAll(async () => {
    const admin = adminClient();
    const { data: client, error } = await admin
      .from("clients")
      .insert({
        kind: "persona",
        first_name: `KanbanDetalle${run}`,
        last_name: "Prueba",
        shopify_customer_id: `gid://shopify/Customer/k${run}`,
      })
      .select("id")
      .single();
    if (error) throw error;
    clientId = client.id;

    const { data: r, error: rError } = await admin
      .from("restorations")
      .insert({ client_id: clientId, payment_type: "credito" })
      .select("id, code")
      .single();
    if (rError) throw rError;
    restoration = r;
    const { data: pieces, error: piecesError } = await admin
      .from("pieces")
      .insert([
        { restoration_id: r.id, description: "Jarra aprobada", price: 10 },
        { restoration_id: r.id, description: "Bandeja nueva", price: 20 },
        { restoration_id: r.id, description: "Copa consulta", price: 30 },
        { restoration_id: r.id, description: "Fuente teclado", price: 40 },
      ] as never)
      .select("id, code, description");
    if (piecesError) throw piecesError;
    const approved = pieces!.find((p) => p.description === "Jarra aprobada")!;
    approvedCode = approved.code;
    const codeOf = (description: string) =>
      pieces!.find((p) => p.description === description)!.code;
    newCode = codeOf("Bandeja nueva");
    consultCode = codeOf("Copa consulta");
    keyboardCode = codeOf("Fuente teclado");
    await admin
      .from("pieces")
      .update({
        status: "aprobada",
        approved_at: new Date().toISOString(),
      } as never)
      .eq("id", approved.id);
  });

  test.afterAll(async () => {
    const admin = adminClient();
    await admin
      .from("shopify_sync_jobs")
      .delete()
      .eq("entity_id", restoration.id);
    await admin.from("pieces").delete().eq("restoration_id", restoration.id);
    await admin.from("restorations").delete().eq("id", restoration.id);
    await admin.from("clients").delete().eq("id", clientId);
  });

  test("cambia a Kanban y ve cada pieza en la columna de su estado", async ({
    page,
    loginAs,
    makeAxeBuilder,
  }) => {
    await loginAs("ventas");
    await page.goto(`/restauraciones/${restoration.id}`);
    const views = page.getByRole("navigation", { name: "Vista" });
    await expect(views.getByRole("link", { name: "Lista" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await views.getByRole("link", { name: "Kanban" }).click();
    await expect(page).toHaveURL(/vista=kanban/);

    const approved = page.getByTestId(`tarjeta-${approvedCode}`);
    await expect(
      page
        .getByTestId("columna-aprobada")
        .getByTestId(`tarjeta-${approvedCode}`),
    ).toBeVisible();
    await expect(approved).toContainText("Jarra aprobada");
    await expect(
      page.getByTestId("columna-registrada").getByTestId(`tarjeta-${newCode}`),
    ).toContainText("Bandeja nueva");
    // Las columnas finales sin piezas no se muestran.
    await expect(page.getByTestId("columna-entregada")).toHaveCount(0);
    await expect(page.getByTestId("columna-observada")).toContainText(
      "Sin piezas",
    );

    const results = await makeAxeBuilder().analyze();
    expect(
      results.violations.filter((v) =>
        ["critical", "serious"].includes(v.impact ?? ""),
      ),
    ).toEqual([]);

    // La tarjeta lleva al detalle de la pieza, que tiene el acceso a su guía (P55).
    await approved.getByRole("link", { name: approvedCode }).click();
    await expect(page).toHaveURL(/\/piezas\/[0-9a-f-]{36}$/, {
      timeout: 30_000,
    });
    await expect(
      page.getByRole("heading", { level: 1, name: approvedCode }),
    ).toBeVisible();
    await page.getByRole("link", { name: /Ver guía RES-/ }).click();
    await expect(page).toHaveURL(/\/restauraciones\/[0-9a-f-]{36}$/);
    await expect(page.getByTestId(`pieza-${approvedCode}`)).toBeVisible();
  });

  test("en el celular las columnas se desplazan sin mover la página @mobile", async ({
    page,
    loginAs,
    isMobile,
  }) => {
    test.skip(!isMobile, "Solo aplica al proyecto móvil");
    await loginAs("logistica");
    await page.goto(`/restauraciones/${restoration.id}?vista=kanban`);
    await expect(page.getByTestId(`tarjeta-${approvedCode}`)).toBeVisible();
    // Logística no ve montos.
    await expect(page.getByTestId("precio")).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(page.viewportSize()?.width ?? Infinity);
  });
  test.describe("mover piezas de estado", () => {
    // Pantalla ancha: las columnas de destino quedan lejos del borde que desplaza.
    test.use({ viewport: { width: 1920, height: 1080 } });

    const kanban = (page: import("@playwright/test").Page) =>
      page.goto(`/restauraciones/${restoration.id}?vista=kanban`);

    test("arrastra una pieza de Registrada a Aprobada y queda guardada", async ({
      page,
      loginAs,
    }) => {
      await loginAs("ventas");
      await kanban(page);
      const registered = page.getByTestId("columna-registrada");
      const approvedColumn = page.getByTestId("columna-aprobada");
      const card = registered.getByTestId(`tarjeta-${newCode}`);
      await expect(card).toBeVisible();

      await dragWithMouse(
        page,
        card.getByText("Bandeja nueva"),
        approvedColumn,
        async () => {
          // En el aire: se resaltan las columnas permitidas y se atenúan las demás.
          await expect(approvedColumn).toHaveAttribute(
            "data-drop",
            "permitida",
          );
          await expect(page.getByTestId("columna-en_consulta")).toHaveAttribute(
            "data-drop",
            "permitida",
          );
          await expect(page.getByTestId("columna-observada")).toHaveAttribute(
            "data-drop",
            "bloqueada",
          );
          // Anulado no tiene piezas: aparece solo como destino.
          await expect(page.getByTestId("columna-anulada")).toHaveAttribute(
            "data-drop",
            "permitida",
          );
        },
      );

      await expect(
        approvedColumn.getByTestId(`tarjeta-${newCode}`),
      ).toBeVisible();
      await expect(page.getByText(`${newCode}: Aprobada.`)).toBeVisible();
      await expect(page.getByTestId("columna-anulada")).toHaveCount(0);

      await page.reload();
      await expect(
        page.getByTestId("columna-aprobada").getByTestId(`tarjeta-${newCode}`),
      ).toBeVisible();
    });

    test("soltar en una columna no permitida no la mueve y explica por qué", async ({
      page,
      loginAs,
    }) => {
      await loginAs("ventas");
      await kanban(page);
      const card = page
        .getByTestId("columna-registrada")
        .getByTestId(`tarjeta-${consultCode}`);
      await dragWithMouse(
        page,
        card.getByText("Copa consulta"),
        page.getByTestId("columna-enviada_taller"),
      );
      await expect(
        page.getByText(
          "No se puede pasar de «Registrada» a «En restauración».",
          {
            exact: true,
          },
        ),
      ).toBeVisible();
      await expect(
        page
          .getByTestId("columna-registrada")
          .getByTestId(`tarjeta-${consultCode}`),
      ).toBeVisible();
    });

    test("al soltar en Consulta pide la nota con el diálogo de siempre", async ({
      page,
      loginAs,
    }) => {
      await loginAs("ventas");
      await kanban(page);
      const card = page
        .getByTestId("columna-registrada")
        .getByTestId(`tarjeta-${consultCode}`);
      await dragWithMouse(
        page,
        card.getByText("Copa consulta"),
        page.getByTestId("columna-en_consulta"),
      );
      const dialog = page.getByRole("dialog", {
        name: `Poner en consulta: ${consultCode}`,
      });
      await expect(dialog).toBeVisible();
      await dialog.getByLabel("Nota (obligatoria)").fill("¿Tiene arreglo?");
      await dialog
        .getByRole("button", { name: "Confirmar: Poner en consulta" })
        .click();
      await expect(dialog).toBeHidden();
      await expect(
        page
          .getByTestId("columna-en_consulta")
          .getByTestId(`tarjeta-${consultCode}`),
      ).toBeVisible();
    });

    test("con el teclado: toma la pieza con el asa, la lleva con flechas y la suelta", async ({
      page,
      loginAs,
      makeAxeBuilder,
    }) => {
      await loginAs("ventas");
      await kanban(page);
      const handle = page.getByRole("button", {
        name: `Arrastrar ${keyboardCode}`,
      });
      // Los avisos del lector de pantalla (región viva de dnd-kit), en español.
      const live = page.locator('[id^="DndLiveRegion"]');
      await handle.focus();
      await page.keyboard.press("Space");
      await expect(live).toContainText(
        `Tomaste ${keyboardCode}, en Registrada. Puede ir a: Consulta, Aprobada, Anulado.`,
      );
      await expect(page.getByTestId("columna-aprobada")).toHaveAttribute(
        "data-drop",
        "permitida",
      );
      // Registrada → Consulta → Espera → Aprobada, una columna por flecha.
      for (const over of [
        "sobre Consulta.",
        "sobre Espera respuesta cliente: ahí no se puede soltar.",
        "sobre Aprobada.",
      ]) {
        await page.keyboard.press("ArrowRight");
        await expect(live).toContainText(`${keyboardCode} está ${over}`);
      }
      await page.keyboard.press("Space");
      await expect(live).toContainText(`Soltaste ${keyboardCode} en Aprobada.`);
      await expect(
        page
          .getByTestId("columna-aprobada")
          .getByTestId(`tarjeta-${keyboardCode}`),
      ).toBeVisible();

      // Sin arrastrar: «Mover a…» lista los estados permitidos.
      await page
        .getByRole("button", { name: `Mover ${keyboardCode} a…` })
        .click();
      const menu = page.getByRole("menu");
      await expect(menu.getByRole("menuitem")).toHaveText(["Anulado"]);
      const results = await makeAxeBuilder().analyze();
      expect(
        results.violations.filter((v) =>
          ["critical", "serious"].includes(v.impact ?? ""),
        ),
      ).toEqual([]);
      await page.keyboard.press("Escape");
    });
  });
});
