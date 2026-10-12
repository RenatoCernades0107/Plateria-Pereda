import { expect, test } from "./fixtures";
import { adminClient } from "./support/supabase";

// Comparten el cliente y la restauración sembrados: en serie.
test.describe.configure({ mode: "serial" });

const run = `${Date.now()}`.slice(-6);
let clientId = "";
let restoration = { id: "", code: "" };
/** Códigos de las piezas (p. ej. RES-00012-1). */
let approvedCode = "";
let newCode = "";

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
      ] as never)
      .select("id, code, description");
    if (piecesError) throw piecesError;
    const approved = pieces!.find((p) => p.description === "Jarra aprobada")!;
    approvedCode = approved.code;
    newCode = pieces!.find((p) => p.description === "Bandeja nueva")!.code;
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

    // La tarjeta lleva a la pieza en la lista.
    await approved.getByRole("link", { name: approvedCode }).click();
    await expect(page).not.toHaveURL(/vista=kanban/);
    await expect(page).toHaveURL(/#pieza-/);
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
});
