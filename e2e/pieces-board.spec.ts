import { expect, test } from "./fixtures";
import { dragWithMouse } from "./support/drag";
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
    await page
      .getByRole("navigation", { name: "Mostrar solo" })
      .getByRole("link", { name: "Urgentes" })
      .click();
    await expect(page).toHaveURL(/urgentes=1/);
    await expect(page.getByText("1 pieza · Página 1 de 1")).toBeVisible();

    await page.goto(`/piezas?q=Vuelta`);
    await page.getByLabel("Elegir todas las de esta página").check();
    const bar = page.getByRole("region", {
      name: "Acciones para las piezas elegidas",
    });
    await bar.getByRole("button", { name: "Recibir del taller" }).click();
    // Se espera a que se guarde antes de navegar (si no, la acción se corta).
    for (const piece of pieces)
      await expect(page.getByTestId(`pieza-${piece.code}`)).toContainText(
        "En tienda",
      );
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

  test("en kanban arrastra una pieza de Aprobada a Interno eligiendo el taller", async ({
    page,
    loginAs,
  }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    const { pieces } = await seedReceived(1, "Arrastre");
    const code = pieces[0]!.code;
    await loginAs("logistica");
    await page.goto(`/piezas?q=${clientName}&vista=kanban`);
    const approved = page.getByTestId("columna-aprobada");
    const card = approved.getByTestId(`tarjeta-${code}`);
    await expect(card).toBeVisible();

    await dragWithMouse(
      page,
      card.getByText("Arrastre 1"),
      page.getByTestId("columna-enviada_taller"),
      async () => {
        // Logística no aprueba ni anula: esas columnas se atenúan.
        await expect(page.getByTestId("columna-registrada")).toHaveAttribute(
          "data-drop",
          "bloqueada",
        );
        await expect(page.getByTestId("columna-anulada")).toHaveCount(0);
      },
    );
    const dialog = page.getByRole("dialog", {
      name: `Enviar al taller: ${code}`,
    });
    await dialog.getByLabel("Taller").click();
    await page.getByRole("option", { name: workshopName }).click();
    await dialog
      .getByRole("button", { name: "Confirmar: Enviar al taller" })
      .click();
    await expect(
      page.getByTestId("columna-enviada_taller").getByTestId(`tarjeta-${code}`),
    ).toContainText(workshopName);
    await page.reload();
    await expect(
      page.getByTestId("columna-enviada_taller").getByTestId(`tarjeta-${code}`),
    ).toBeVisible();
  });
  test("tabla tipo hoja: logística pone el costo, el admin el precio; filtra por guía y abre la pieza (P55)", async ({
    page,
    loginAs,
    makeAxeBuilder,
  }) => {
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
      .insert({
        restoration_id: r.id,
        description: "Tetera hoja",
        service_name: "Baño de plata",
        material_name: "Plata",
        price: null,
      } as never)
      .select("id, code");
    const code = pieces![0]!.code;
    await seedReceived(1, "Otra guía");

    // Logística: filtra por el número de la guía e ingresa el costo de servicio.
    await loginAs("logistica");
    await page.goto("/piezas");
    await page.getByLabel("N.º de guía").fill(r.code.replace(/^RES-0*/, ""));
    await page.getByRole("button", { name: "Filtrar" }).click();
    await expect(page).toHaveURL(/guia=\d+/);
    await expect(page.getByText("1 pieza · Página 1 de 1")).toBeVisible();
    const row = page.getByTestId(`pieza-${code}`);
    await expect(row).toContainText("Baño de plata");
    await expect(row).toContainText("Sin foto de antes");
    await expect(
      page.getByRole("columnheader", { name: "Precio venta" }),
    ).toHaveCount(0);
    await expect(row).toContainText("Por definir");
    await row
      .getByRole("button", { name: `Editar costo de servicio de ${code}` })
      .click();
    const costDialog = page.getByRole("dialog", {
      name: `Costo de servicio de ${code}`,
    });
    await costDialog.getByLabel("Costo de servicio (S/)").fill("45");
    await costDialog.getByRole("button", { name: "Guardar costo" }).click();
    await expect(page.getByText(`Costo de ${code} guardado.`)).toBeVisible();
    await expect(row).toContainText("S/ 45.00");

    // Admin: ve el costo y pone el precio de venta.
    await loginAs("admin");
    await page.goto(`/piezas?guia=${encodeURIComponent(r.code)}`);
    const adminRow = page.getByTestId(`pieza-${code}`);
    await expect(adminRow).toContainText("S/ 45.00");
    await page.getByRole("button", { name: "Editar precios" }).click();
    await adminRow.getByLabel(`Precio de venta de ${code}`).fill("120");
    await adminRow
      .getByRole("button", { name: `Guardar precio de ${code}` })
      .click();
    await expect(page.getByText(`Precio de ${code} guardado.`)).toBeVisible();
    const serious = async () =>
      (await makeAxeBuilder().analyze()).violations.filter((v) =>
        ["critical", "serious"].includes(v.impact ?? ""),
      );
    expect(await serious()).toEqual([]);

    // La pieza abre su detalle, con un acceso explícito a la guía.
    await adminRow.getByRole("link", { name: code }).click();
    await expect(page).toHaveURL(new RegExp(`/piezas/${pieces![0]!.id}$`));
    await expect(
      page.getByRole("heading", { level: 1, name: code }),
    ).toBeVisible();
    await expect(page.getByLabel(`Precio de venta de ${code}`)).toHaveValue(
      "120.00",
    );
    expect(await serious()).toEqual([]);
    await page.getByRole("link", { name: `Ver guía ${r.code}` }).click();
    await expect(page).toHaveURL(new RegExp(`/restauraciones/${r.id}$`));
  });

  test("las entregadas hoy siguen en la vista; las de días anteriores, en el historial", async ({
    page,
    loginAs,
  }) => {
    const { pieces } = await seedReceived(2, "Entregada");
    const [today, before] = pieces;
    const admin = adminClient();
    await admin
      .from("pieces")
      .update({
        status: "entregada",
        delivered_at: new Date().toISOString(),
      } as never)
      .eq("id", today!.id);
    await admin
      .from("pieces")
      .update({
        status: "entregada",
        delivered_at: new Date(Date.now() - 3 * 86_400_000).toISOString(),
      } as never)
      .eq("id", before!.id);

    await loginAs("admin");
    await page.goto(`/piezas?q=${clientName}&estado=entregada`);
    await expect(page.getByTestId(`pieza-${today!.code}`)).toContainText(
      "Entregada",
    );
    await expect(page.getByTestId(`pieza-${before!.code}`)).toHaveCount(0);

    await page.getByRole("link", { name: "Historial" }).click();
    await expect(page).toHaveURL(/\/piezas\/historial$/);
    await page.getByLabel("Código, descripción o cliente").fill(clientName);
    await page.getByRole("button", { name: "Filtrar" }).click();
    await expect(page.getByTestId(`historial-${before!.code}`)).toBeVisible();
    await expect(page.getByTestId(`historial-${today!.code}`)).toBeVisible();
  });
});
