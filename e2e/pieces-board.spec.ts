import { expect, test } from "./fixtures";
import { ensureCatalogItem } from "./support/catalog";
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
    // La pieza de la tabla enlaza servicio y material por nombre: tienen que estar en el catálogo.
    await ensureCatalogItem("services", "Baño de plata");
    await ensureCatalogItem("materials", "Plata");
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
    // Logística no ve clientes: el filtro de texto dice solo "Código o descripción".
    await page.getByLabel("Código o descripción").fill(clientName);
    await page.getByLabel("Ubicación").click();
    await page.getByRole("option", { name: "Sin enviar" }).click();
    await page.getByLabel("Estado", { exact: true }).click();
    await page.getByRole("option", { name: "Aprobada" }).click();
    await expect(page).toHaveURL(/ubicacion=sin_enviar&estado=aprobada/);
    await expect(page.getByText("3 piezas · Página 1 de 1")).toBeVisible();

    await page.getByLabel("Elegir todas las de esta página").check();
    const bar = page.getByRole("region", {
      name: "Acciones para las piezas elegidas",
    });
    await expect(bar).toContainText("3 de 3 seleccionadas");
    await bar.getByRole("button", { name: "Enviar al taller" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Taller").click();
    await page.getByRole("option", { name: workshopName }).click();
    await dialog
      .getByRole("button", { name: /Confirmar: enviar al taller/i })
      .click();
    await expect(
      page.getByText("No encontramos resultados para tu búsqueda."),
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

  test("resalta las piezas con muchos días en el taller y muestra el precio de venta a logística", async ({
    page,
    loginAs,
  }) => {
    const { pieces } = await seedReceived(1, "Candelabro antiguo");
    const admin = adminClient();
    await admin
      .from("pieces")
      .update({
        workshop_id: workshopId,
        first_sent_at: new Date(Date.now() - 9 * 86_400_000).toISOString(),
        last_sent_at: new Date(Date.now() - 9 * 86_400_000).toISOString(),
      } as never)
      .eq("id", pieces[0]!.id);
    await admin.from("piece_status_history").insert({
      piece_id: pieces[0]!.id,
      restoration_id: restorationIds.at(-1)!,
      from_status: "aprobada",
      to_status: "aprobada",
      event: "envio_taller",
      occurred_at: new Date(Date.now() - 9 * 86_400_000).toISOString(),
    } as never);
    // Quita los pasos con la fecha de hoy para que el viaje siga abierto desde hace 9 días.
    await admin
      .from("piece_status_history")
      .delete()
      .eq("piece_id", pieces[0]!.id)
      .neq("event", "envio_taller");

    await loginAs("logistica");
    await page.goto(`/piezas?q=Candelabro antiguo&dias=7`);
    const row = page.getByTestId(`pieza-${pieces[0]!.code}`);
    await expect(row.getByTestId("dias-en-taller")).toContainText(
      "9 días (en curso)",
    );
    await expect(row.getByLabel("Muchos días en el taller")).toBeVisible();
    await expect(row).toContainText("S/ 10.00");
  });

  test("acción masiva desde el celular @mobile", async ({
    page,
    loginAs,
    isMobile,
  }) => {
    test.skip(!isMobile, "Solo aplica al proyecto móvil");
    const { pieces } = await seedReceived(2, "Movil");
    await loginAs("logistica");
    // Siguen Aprobadas al enviarlas: se filtra por ubicación para que salgan de la lista.
    await page.goto(`/piezas?q=${clientName}&ubicacion=sin_enviar`);
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
      .getByRole("button", { name: /Confirmar: enviar al taller/i })
      .click();
    await expect(
      page.getByText("No encontramos resultados para tu búsqueda."),
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
    // Por guía, en el orden de las piezas: la urgente no sube, se marca.
    const rows = page.locator("[data-testid^='pieza-']");
    await expect(rows.first()).toHaveAttribute(
      "data-testid",
      `pieza-${pieces[0]!.code}`,
    );
    await expect(rows.nth(1)).toContainText("Urgente");
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
    await expect(bar).toContainText("2 piezas seleccionadas");
    await bar.getByRole("button", { name: "Enviar al taller" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Taller").click();
    await page.getByRole("option", { name: workshopName }).click();
    await dialog
      .getByRole("button", { name: /Confirmar: enviar al taller/i })
      .click();
    // Siguen Aprobadas: la columna «En restauración» agrupa las que están en el taller.
    const sent = page.getByTestId("columna-en_restauracion");
    for (const piece of pieces)
      await expect(sent.getByTestId(`tarjeta-${piece.code}`)).toContainText(
        workshopName,
      );
    await expect(received).toContainText("Sin piezas");
    await expect(page).toHaveURL(/vista=kanban/);
  });

  test("en kanban arrastra una pieza de Aprobada a En restauración eligiendo el taller", async ({
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

    // «En restauración» no es un estado: soltar ahí envía la pieza al taller.
    await dragWithMouse(
      page,
      card.getByText("Arrastre 1"),
      page.getByTestId("columna-en_restauracion"),
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
      .getByRole("button", { name: /Confirmar: enviar al taller/i })
      .click();
    await expect(
      page
        .getByTestId("columna-en_restauracion")
        .getByTestId(`tarjeta-${code}`),
    ).toContainText(workshopName);
    await page.reload();
    await expect(
      page
        .getByTestId("columna-en_restauracion")
        .getByTestId(`tarjeta-${code}`),
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
    await expect(page).toHaveURL(/guia=\d+/);
    await expect(page.getByText("1 pieza · Página 1 de 1")).toBeVisible();
    const row = page.getByTestId(`pieza-${code}`);
    await expect(row).toContainText("Baño de plata");
    await expect(row).toContainText("Sin foto de antes");
    // Desde el 2026-10-19 logística también ve (y asigna) el precio de venta.
    await expect(
      page.getByRole("columnheader", { name: "Precio venta" }),
    ).toBeVisible();
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
    // Con el costo ya puesto, su lápiz ya no sale en la tabla (se cambia en el detalle).
    await expect(
      adminRow.getByRole("button", {
        name: `Editar costo de servicio de ${code}`,
      }),
    ).toHaveCount(0);
    await adminRow
      .getByRole("button", { name: `Editar precio de venta de ${code}` })
      .click();
    const priceDialog = page.getByRole("dialog", {
      name: `Precio de venta de ${code}`,
    });
    await priceDialog.getByLabel("Precio de venta unitario (S/)").fill("120");
    await priceDialog.getByRole("button", { name: "Guardar precio" }).click();
    await expect(page.getByText(`Precio de ${code} guardado.`)).toBeVisible();
    await expect(adminRow).toContainText("S/ 120.00");
    await expect(
      adminRow.getByRole("button", {
        name: `Editar precio de venta de ${code}`,
      }),
    ).toHaveCount(0);
    const serious = async () =>
      (await makeAxeBuilder().analyze()).violations.filter((v) =>
        ["critical", "serious"].includes(v.impact ?? ""),
      );
    expect(await serious()).toEqual([]);

    // La pieza abre su detalle, con un acceso explícito a la guía.
    await adminRow.getByRole("link", { name: code }).click();
    await expect(page).toHaveURL(new RegExp(`/piezas/${pieces![0]!.id}$`));
    await expect(page.getByTestId("rotulo-pieza")).toContainText(code);
    await expect(page.getByRole("region", { name: "Montos" })).toContainText(
      "S/ 120.00",
    );
    // El taller se asigna o cambia desde el detalle de la pieza.
    await expect(
      page
        .getByRole("region", { name: "Datos de la pieza" })
        .getByRole("button", { name: `Asignar taller de ${code}` }),
    ).toBeVisible();
    expect(await serious()).toEqual([]);
    await page.getByRole("link", { name: `Ver guía ${r.code}` }).click();
    await expect(page).toHaveURL(new RegExp(`/restauraciones/${r.id}$`));
  });

  test("las entregadas hoy siguen en la vista; las de días anteriores, en el historial", async ({
    page,
    loginAs,
  }) => {
    const { restoration, pieces } = await seedReceived(2, "Entregada");
    const [today, before] = pieces;
    const admin = adminClient();
    // "Al crédito": se entrega sin cobrar el saldo (P45).
    const credit = await admin
      .from("restorations")
      .update({ payment_type: "credito" } as never)
      .eq("id", restoration.id);
    expect(credit.error).toBeNull();
    for (const [piece, deliveredAt] of [
      [today!, new Date()],
      [before!, new Date(Date.now() - 3 * 86_400_000)],
    ] as const) {
      const { error } = await admin
        .from("pieces")
        .update({
          status: "entregada",
          delivered_at: deliveredAt.toISOString(),
        } as never)
        .eq("id", piece.id);
      expect(error).toBeNull();
    }

    await loginAs("admin");
    await page.goto(`/piezas?q=${clientName}&estado=entregada`);
    await expect(page.getByTestId(`pieza-${today!.code}`)).toContainText(
      "Entregada",
    );
    await expect(page.getByTestId(`pieza-${before!.code}`)).toHaveCount(0);

    await page.getByRole("link", { name: "Historial" }).click();
    await expect(page).toHaveURL(/\/piezas\/historial$/);
    await page.getByLabel("Código, descripción o cliente").fill(clientName);
    await expect(page.getByTestId(`historial-${before!.code}`)).toBeVisible();
    await expect(page.getByTestId(`historial-${today!.code}`)).toBeVisible();
  });

  test("cambia el estado desde la fila de la tabla, con su diálogo si pide datos", async ({
    page,
    loginAs,
  }) => {
    const { pieces } = await seedReceived(1, "Fila estado");
    const code = pieces[0]!.code;
    await loginAs("logistica");
    await page.goto(`/piezas?q=Fila estado`);
    const row = page.getByTestId(`pieza-${code}`);
    await row
      .getByRole("button", { name: `Cambiar estado de ${code}` })
      .click();
    await page.getByRole("menuitem", { name: "Enviar al taller" }).click();
    const dialog = page.getByRole("dialog", {
      name: `Enviar al taller: ${code}`,
    });
    await dialog.getByLabel("Taller").click();
    await page.getByRole("option", { name: workshopName }).click();
    await dialog
      .getByRole("button", { name: /Confirmar: enviar al taller/i })
      .click();
    // El estado no cambia: sigue Aprobada, ahora En taller.
    await expect(row).toContainText("Aprobada");
    await expect(row).toContainText("En taller");
    await expect(row).toContainText(workshopName);
  });
});
