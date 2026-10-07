import { expect, test } from "./fixtures";
import { adminClient } from "./support/supabase";

// Comparten las piezas y el taller sembrados: en serie.
test.describe.configure({ mode: "serial" });

const run = `${Date.now()}`.slice(-6);
const clientName = `Tablero${run}`;
const workshopName = `Taller A ${run}`;
let clientId = "";
let workshopId = "";
const restorationIds: string[] = [];

/** Restauración con piezas aprobadas que ya están en la tienda. */
async function seedReceived(count: number, prefix: string) {
  const admin = adminClient();
  const { data: r, error } = await admin
    .from("restorations")
    .insert({ client_id: clientId, payment_type: "contado" })
    .select("id, code")
    .single();
  if (error) throw error;
  restorationIds.push(r.id);
  const { data: pieces } = await admin
    .from("pieces")
    .insert(
      Array.from({ length: count }, (_, i) => ({
        restoration_id: r.id,
        description: `${prefix} ${i + 1}`,
        price: 10,
        arrived_at: new Date().toISOString(),
      })) as never,
    )
    .select("id, code");
  await admin
    .from("pieces")
    .update({
      status: "aprobada",
      approved_at: new Date().toISOString(),
    } as never)
    .eq("restoration_id", r.id);
  return { restoration: r, pieces: pieces! };
}

test.describe("Vista de piezas", () => {
  test.beforeAll(async () => {
    const admin = adminClient();
    const { data: client, error } = await admin
      .from("clients")
      .insert({
        kind: "persona",
        first_name: clientName,
        last_name: "Prueba",
        shopify_customer_id: `gid://shopify/Customer/t${run}`,
      })
      .select("id")
      .single();
    if (error) throw error;
    clientId = client.id;
    const { data: workshop } = await admin
      .from("workshops")
      .insert({ name: workshopName })
      .select("id")
      .single();
    workshopId = workshop!.id;
  });

  test.afterAll(async () => {
    const admin = adminClient();
    await admin
      .from("shopify_sync_jobs")
      .delete()
      .in("entity_id", restorationIds);
    await admin.from("pieces").delete().in("restoration_id", restorationIds);
    await admin.from("restorations").delete().in("id", restorationIds);
    await admin.from("clients").delete().eq("id", clientId);
    await admin.from("workshops").delete().eq("id", workshopId);
  });

  test("logística filtra Sin enviar / Aprobada, elige 3 piezas y las envía al taller", async ({
    page,
    loginAs,
  }) => {
    await seedReceived(2, "Cubierto");
    await seedReceived(1, "Bandeja");
    await loginAs("logistica");
    await page.goto("/piezas");
    await page.getByLabel("Código, descripción o cliente").fill(clientName);
    await page.getByLabel("Ubicación").click();
    await page.getByRole("option", { name: "Sin enviar" }).click();
    await page.getByLabel("Estado").click();
    await page.getByRole("option", { name: "Aprobada" }).click();
    await page.getByRole("button", { name: "Filtrar" }).click();
    await expect(page).toHaveURL(/ubicacion=sin_enviar&estado=aprobada/);
    await expect(page.getByText("3 piezas · Página 1 de 1")).toBeVisible();

    await page.getByLabel("Elegir todas las de esta página").check();
    const bar = page.getByRole("region", {
      name: "Acciones para las piezas elegidas",
    });
    await expect(bar).toContainText("3 piezas elegidas");
    await bar.getByRole("button", { name: "Enviar al taller" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Taller").click();
    await page.getByRole("option", { name: workshopName }).click();
    await dialog
      .getByRole("button", { name: "Confirmar: Enviar al taller" })
      .click();
    await expect(
      page.getByText("No hay piezas con esos filtros."),
    ).toBeVisible();

    await page.goto(`/piezas?q=${clientName}&ubicacion=en_taller`);
    await expect(page.getByText("3 piezas · Página 1 de 1")).toBeVisible();
    await expect(page.getByTestId("dias-en-taller").first()).toContainText(
      "0 días (en curso)",
    );
    await expect(page.locator("[data-testid^='pieza-']").first()).toContainText(
      workshopName,
    );
  });

  test("resalta las piezas con muchos días en el taller y no muestra precios", async ({
    page,
    loginAs,
  }) => {
    const { pieces } = await seedReceived(1, "Candelabro antiguo");
    const admin = adminClient();
    await admin
      .from("pieces")
      .update({
        status: "enviada_taller",
        workshop_id: workshopId,
        last_sent_at: new Date(Date.now() - 9 * 86_400_000).toISOString(),
      } as never)
      .eq("id", pieces[0]!.id);
    await admin.from("piece_status_history").insert({
      piece_id: pieces[0]!.id,
      restoration_id: restorationIds.at(-1)!,
      from_status: "aprobada",
      to_status: "enviada_taller",
      occurred_at: new Date(Date.now() - 9 * 86_400_000).toISOString(),
    } as never);
    // Quita los pasos con la fecha de hoy para que el viaje siga abierto desde hace 9 días.
    await admin
      .from("piece_status_history")
      .delete()
      .eq("piece_id", pieces[0]!.id)
      .neq("to_status", "enviada_taller");

    await loginAs("logistica");
    await page.goto(`/piezas?q=Candelabro antiguo&dias=7`);
    const row = page.getByTestId(`pieza-${pieces[0]!.code}`);
    await expect(row.getByTestId("dias-en-taller")).toContainText(
      "9 días (en curso)",
    );
    await expect(row.getByLabel("Muchos días en el taller")).toBeVisible();
    await expect(row).not.toContainText("S/");
  });

  test("acción masiva desde el celular @mobile", async ({
    page,
    loginAs,
    isMobile,
  }) => {
    test.skip(!isMobile, "Solo aplica al proyecto móvil");
    const { pieces } = await seedReceived(2, "Movil");
    await loginAs("logistica");
    await page.goto(`/piezas?q=${clientName}&estado=aprobada`);
    for (const piece of pieces)
      await page.getByLabel(`Elegir ${piece.code}`).check();
    const bar = page.getByRole("region", {
      name: "Acciones para las piezas elegidas",
    });
    await bar.getByRole("button", { name: "Enviar al taller" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Taller").click();
    await page.getByRole("option", { name: workshopName }).click();
    await dialog
      .getByRole("button", { name: "Confirmar: Enviar al taller" })
      .click();
    await expect(
      page.getByText("No hay piezas con esos filtros."),
    ).toBeVisible();
    const scrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    expect(scrollWidth).toBeLessThanOrEqual(
      page.viewportSize()?.width ?? Infinity,
    );
  });
  test("recibe del taller en bloque y filtra urgentes y listas para entregar (P47)", async ({
    page,
    loginAs,
  }) => {
    const { pieces } = await seedReceived(2, "Vuelta");
    const admin = adminClient();
    await admin
      .from("pieces")
      .update({
        status: "enviada_taller",
        workshop_id: workshopId,
        first_sent_at: new Date().toISOString(),
        last_sent_at: new Date().toISOString(),
      } as never)
      .in(
        "id",
        pieces.map((p) => p.id),
      );
    await admin
      .from("pieces")
      .update({ urgent: true } as never)
      .eq("id", pieces[1]!.id);

    await loginAs("logistica");
    await page.goto(`/piezas?q=Vuelta`);
    // Las urgentes van primero.
    await expect(page.locator("[data-testid^='pieza-']").first()).toContainText(
      "Urgente",
    );
    await page.getByLabel("Solo urgentes").check();
    await page.getByRole("button", { name: "Filtrar" }).click();
    await expect(page).toHaveURL(/urgentes=1/);
    await expect(page.getByText("1 pieza · Página 1 de 1")).toBeVisible();

    await page.goto(`/piezas?q=Vuelta`);
    await page.getByLabel("Elegir todas las de esta página").check();
    const bar = page.getByRole("region", {
      name: "Acciones para las piezas elegidas",
    });
    await bar.getByRole("button", { name: "Recibir del taller" }).click();
    await page.goto(`/piezas?q=Vuelta&listas=1`);
    await expect(page.getByText("2 piezas · Página 1 de 1")).toBeVisible();
    await expect(page.locator("[data-testid^='pieza-']").first()).toContainText(
      "En tienda",
    );
  });

  test("en kanban elige piezas de una columna y las envía al taller", async ({
    page,
    loginAs,
  }) => {
    const { pieces } = await seedReceived(2, "Kanban");
    await loginAs("logistica");
    await page.goto(`/piezas?q=${clientName}`);
    await page
      .getByRole("navigation", { name: "Vista" })
      .getByRole("link", { name: "Kanban" })
      .click();
    await expect(page).toHaveURL(/vista=kanban/);
    const received = page.getByTestId("columna-aprobada");
    for (const piece of pieces) {
      await expect(received.getByTestId(`tarjeta-${piece.code}`)).toBeVisible();
      await received.getByLabel(`Elegir ${piece.code}`).check();
    }
    const bar = page.getByRole("region", {
      name: "Acciones para las piezas elegidas",
    });
    await expect(bar).toContainText("2 piezas elegidas");
    await bar.getByRole("button", { name: "Enviar al taller" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Taller").click();
    await page.getByRole("option", { name: workshopName }).click();
    await dialog
      .getByRole("button", { name: "Confirmar: Enviar al taller" })
      .click();
    const sent = page.getByTestId("columna-enviada_taller");
    for (const piece of pieces)
      await expect(sent.getByTestId(`tarjeta-${piece.code}`)).toContainText(
        workshopName,
      );
    await expect(received).toContainText("Sin piezas");
    await expect(page).toHaveURL(/vista=kanban/);
  });
});
