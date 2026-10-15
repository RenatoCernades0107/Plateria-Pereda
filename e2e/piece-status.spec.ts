import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import { pieceAction, pieceActionNames } from "./support/pieces";
import { adminClient } from "./support/supabase";

// Comparten el cliente y el taller de prueba: en serie.
test.describe.configure({ mode: "serial" });

const run = `${Date.now()}`.slice(-6);
const workshopName = `Taller Estados ${run}`;
let clientId = "";
let workshopId = "";
const restorationIds: string[] = [];

type NewPiece = {
  description: string;
  arrived?: boolean;
  status?: string;
  workshop?: boolean;
  /** En Interno y ya de vuelta del taller (ubicación "En tienda", P48). */
  back?: boolean;
};

/** Restauración de prueba creada directamente en la BD. */
async function seedRestoration(pieces: NewPiece[]) {
  const admin = adminClient();
  const { data: r, error } = await admin
    .from("restorations")
    .insert({ client_id: clientId, payment_type: "credito" })
    .select("id, code")
    .single();
  if (error) throw error;
  restorationIds.push(r.id);
  for (const p of pieces) {
    const { data: piece, error: pieceError } = await admin
      .from("pieces")
      .insert({
        restoration_id: r.id,
        description: p.description,
        // El servicio es obligatorio al editar la pieza (D59).
        service_name: "Limpieza",
        price: 10,
        arrived_at: p.arrived ? new Date().toISOString() : null,
      } as never)
      .select("id")
      .single();
    if (pieceError) throw pieceError;
    if (p.status) {
      await admin
        .from("pieces")
        .update({
          status: p.status,
          workshop_id: p.workshop ? workshopId : null,
          approved_at: new Date().toISOString(),
          first_sent_at: p.workshop
            ? new Date(Date.now() - 60_000).toISOString()
            : null,
          last_sent_at: p.workshop
            ? new Date(Date.now() - 60_000).toISOString()
            : null,
          last_returned_at: p.back ? new Date().toISOString() : null,
        } as never)
        .eq("id", piece!.id);
    }
  }
  return r as { id: string; code: string };
}

const card = (page: Page, code: string) => page.getByTestId(`pieza-${code}`);
const restorationStatus = (page: Page) =>
  page.getByTestId("estado-restauracion");

test.describe("Estados de las piezas", () => {
  test.beforeAll(async () => {
    const admin = adminClient();
    const { data: client, error } = await admin
      .from("clients")
      .insert({
        kind: "persona",
        first_name: `Estados${run}`,
        last_name: "Prueba",
        shopify_customer_id: `gid://shopify/Customer/s${run}`,
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

  test("flujo feliz: aprobada (Sin enviar) → Interno (En taller) → vuelta (En tienda) → entregada", async ({
    page,
    loginAs,
  }) => {
    const r = await seedRestoration([{ description: "Fuente feliz" }]);
    const code = `${r.code}-1`;

    await loginAs("ventas");
    await page.goto(`/restauraciones/${r.id}`);
    await pieceAction(page, code, "Aprobar");
    await expect(card(page, code)).toContainText("Aprobada");
    await expect(card(page, code)).toContainText("Sin enviar");
    await expect(restorationStatus(page)).toHaveText("Aprobada");

    // Las piezas de oficina ya están en la tienda: no hay "Marcar llegada" (P48).
    await loginAs("logistica");
    await page.goto(`/restauraciones/${r.id}`);
    // Logística sí asigna el taller (D60).
    await expect(
      page
        .getByRole("region", { name: "Acciones para las piezas elegidas" })
        .getByRole("button", { name: "Asignar taller" }),
    ).toBeVisible();
    expect(await pieceActionNames(page, code)).not.toContain(
      "Marcar llegada a tienda",
    );

    await pieceAction(page, code, "Enviar al taller");
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Taller").click();
    await page.getByRole("option", { name: workshopName }).click();
    await dialog
      .getByRole("button", { name: "Confirmar: Enviar al taller" })
      .click();
    await expect(card(page, code)).toContainText("En restauración");
    await expect(card(page, code)).toContainText("En taller");
    await expect(card(page, code)).toContainText(workshopName);
    // Sin "En proceso" (P56): mientras está en el taller la guía sigue Aprobada.
    await expect(restorationStatus(page)).toHaveText("Aprobada");

    await pieceAction(page, code, "Recibir del taller");
    await expect(card(page, code)).toContainText("En tienda");
    await expect(card(page, code)).toContainText("En restauración");
    await expect(restorationStatus(page)).toHaveText("Lista");

    // La entrega la hace ventas: completada, logística ya no la ve (D24).
    await loginAs("ventas");
    await page.goto(`/restauraciones/${r.id}`);
    await pieceAction(page, code, "Entregar");
    await expect(card(page, code)).toContainText("Entregada");
    await expect(restorationStatus(page)).toHaveText("Completada");
  });

  test("revisión en taller: en Consulta va al taller a revisar (En taller) y vuelve (En tienda)", async ({
    page,
    loginAs,
  }) => {
    const r = await seedRestoration([
      { description: "Tetera por revisar", arrived: true },
    ]);
    const code = `${r.code}-1`;
    const { error } = await adminClient()
      .from("pieces")
      .update({ status: "en_consulta" } as never)
      .eq("restoration_id", r.id);
    if (error) throw error;

    await loginAs("logistica");
    await page.goto(`/restauraciones/${r.id}`);
    await expect(card(page, code)).toContainText("Consulta");
    await pieceAction(page, code, "Llevar al taller a revisar");
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Taller").click();
    await page.getByRole("option", { name: workshopName }).click();
    await dialog
      .getByRole("button", { name: "Confirmar: llevar al taller" })
      .click();
    await expect(dialog).toBeHidden();
    // El estado no cambia: sigue en Consulta, ahora En taller.
    await expect(card(page, code)).toContainText("En taller");
    await expect(card(page, code)).toContainText("Consulta");
    await expect(card(page, code)).toContainText(workshopName);
    expect(await pieceActionNames(page, code)).toContain("Volvió de revisión");

    // Al recargar, lo guardado en la BD dice lo mismo.
    await page.reload();
    await expect(card(page, code)).toContainText("En taller");

    await pieceAction(page, code, "Volvió de revisión");
    await expect(card(page, code)).toContainText("En tienda");
    await expect(card(page, code)).toContainText("Consulta");
    await page.reload();
    await expect(card(page, code)).toContainText("En tienda");
    expect(await pieceActionNames(page, code)).toContain(
      "Llevar al taller a revisar",
    );
  });

  test("consulta: consulta → espera respuesta → aprobada, y espera respuesta → rechazado", async ({
    page,
    loginAs,
  }) => {
    const r = await seedRestoration([
      { description: "Jarra con abolladura" },
      { description: "Plato rajado" },
    ]);
    await loginAs("ventas");
    await page.goto(`/restauraciones/${r.id}`);

    for (const code of [`${r.code}-1`, `${r.code}-2`]) {
      await pieceAction(page, code, "Poner en consulta");
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("button", { name: /Confirmar/ }).click();
      await expect(
        dialog.getByText("Escribe una nota para este cambio de estado."),
      ).toBeVisible();
      await dialog.getByLabel("Nota (obligatoria)").fill("¿Se repara el asa?");
      await dialog.getByRole("button", { name: /Confirmar/ }).click();
      await expect(card(page, code)).toContainText("Consulta");
      await pieceAction(page, code, "Esperar respuesta");
      await expect(card(page, code)).toContainText("Espera respuesta cliente");
    }

    await pieceAction(page, `${r.code}-1`, "Aprobar");
    await expect(card(page, `${r.code}-1`)).toContainText("Aprobada");

    await pieceAction(page, `${r.code}-2`, "Rechazar");
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Nota (obligatoria)").fill("El cliente no aceptó");
    await dialog.getByRole("button", { name: "Confirmar: Rechazar" }).click();
    await expect(card(page, `${r.code}-2`)).toContainText(
      "Rechazado (cliente)",
    );
    await expect(restorationStatus(page)).toHaveText("Aprobada");
  });

  test("una pieza de oficina aprobada queda Aprobada y Sin enviar", async ({
    page,
    loginAs,
  }) => {
    const r = await seedRestoration([
      { description: "Candelabro", arrived: true },
    ]);
    await loginAs("ventas");
    await page.goto(`/restauraciones/${r.id}`);
    await pieceAction(page, `${r.code}-1`, "Aprobar");
    await expect(card(page, `${r.code}-1`)).toContainText("Aprobada");
    await expect(card(page, `${r.code}-1`)).toContainText("Sin enviar");
  });

  test("observada y reenvío al taller", async ({ page, loginAs }) => {
    const r = await seedRestoration([
      {
        description: "Bandeja observada",
        arrived: true,
        status: "enviada_taller",
        workshop: true,
        back: true,
      },
    ]);
    const code = `${r.code}-1`;
    await loginAs("ventas");
    await page.goto(`/restauraciones/${r.id}`);
    await pieceAction(page, code, "Observar");
    let dialog = page.getByRole("dialog");
    await dialog.getByLabel("Nota (obligatoria)").fill("Falta pulir el borde");
    await dialog.getByRole("button", { name: "Confirmar: Observar" }).click();
    await expect(card(page, code)).toContainText("Observación");
    // Queda en la tienda por reenviar al taller (P50).
    await expect(card(page, code)).toContainText("Sin enviar");

    await loginAs("logistica");
    await page.goto(`/restauraciones/${r.id}`);
    await pieceAction(page, code, "Enviar al taller");
    dialog = page.getByRole("dialog");
    // El taller ya asignado viene elegido.
    await dialog
      .getByRole("button", { name: "Confirmar: Enviar al taller" })
      .click();
    await expect(card(page, code)).toContainText("En restauración");
    await expect(card(page, code)).toContainText("En taller");
  });

  test("la línea de tiempo muestra usuarios y notas en orden; logística ve solo días y observación", async ({
    page,
    loginAs,
  }) => {
    const r = await seedRestoration([{ description: "Sopera con historia" }]);
    const code = `${r.code}-1`;
    await loginAs("ventas");
    await page.goto(`/restauraciones/${r.id}`);
    await pieceAction(page, code, "Poner en consulta");
    await page
      .getByRole("dialog")
      .getByLabel("Nota (obligatoria)")
      .fill("Consulta inicial");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /Confirmar/ })
      .click();
    await expect(card(page, code)).toContainText("Consulta");
    await pieceAction(page, code, "Esperar respuesta");
    await expect(card(page, code)).toContainText("Espera respuesta");
    await pieceAction(page, code, "Aprobar");
    await expect(card(page, code)).toContainText("Aprobada");

    // La línea de tiempo está en el detalle de la pieza (/piezas/[id]).
    await card(page, code).getByRole("link", { name: code }).click();
    // Título: la descripción; el código va en el rótulo "Pieza N · código".
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Sopera con historia",
    );
    await expect(page.getByTestId("rotulo-pieza")).toContainText(code);
    const piecePath = new URL(page.url()).pathname;
    // Siempre a la vista (horizontal), sin desplegar nada.
    const timeline = page.getByTestId("linea-tiempo");
    await expect(timeline).toBeVisible();
    const events = timeline.getByTestId("evento");
    await expect(events).toHaveCount(4);
    await expect(events.nth(0)).toContainText("Registrada");
    await expect(events.nth(1)).toContainText("Consulta");
    await expect(events.nth(1)).toContainText("Ventas de prueba");
    await expect(events.nth(1)).toContainText("Consulta inicial");
    await expect(events.nth(3)).toContainText("Aprobada");
    await expect(timeline.getByTestId("dias-cumplimiento")).toContainText(
      "(en curso)",
    );

    await page.goto(`/restauraciones/${r.id}`);
    await page.getByRole("tab", { name: "Historial" }).click();
    await expect(page.getByTestId("resumen-estados")).toContainText(
      "Espera respuesta cliente → Aprobada",
    );

    // Observación tras el taller, para el resumen de logística.
    await adminClient()
      .from("pieces")
      .update({
        status: "enviada_taller",
        arrived_at: new Date(Date.now() - 120_000).toISOString(),
        first_sent_at: new Date(Date.now() - 60_000).toISOString(),
        last_sent_at: new Date(Date.now() - 60_000).toISOString(),
        last_returned_at: new Date().toISOString(),
      } as never)
      .eq("restoration_id", r.id);
    await page.goto(`/restauraciones/${r.id}`);
    await pieceAction(page, code, "Observar");
    await page
      .getByRole("dialog")
      .getByLabel("Nota (obligatoria)")
      .fill("Mancha en la tapa");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /Confirmar/ })
      .click();
    await expect(card(page, code)).toContainText("Observación");

    await loginAs("logistica");
    await page.goto(piecePath);
    await expect(page.getByTestId("resumen-logistica")).toBeVisible();
    await expect(page.getByTestId("linea-tiempo")).toHaveCount(0);
    const summary = page.getByTestId("resumen-logistica");
    await expect(summary).toContainText("Días en taller: 0 días");
    await expect(summary).toContainText(
      "Última observación: Mancha en la tapa",
    );
  });

  test("anular todas las piezas deja la restauración Anulada", async ({
    page,
    loginAs,
  }) => {
    const r = await seedRestoration([
      { description: "Pieza A" },
      { description: "Pieza B" },
    ]);
    await loginAs("ventas");
    await page.goto(`/restauraciones/${r.id}`);
    // Todas las piezas vienen elegidas por defecto.
    const bar = page.getByRole("region", {
      name: "Acciones para las piezas elegidas",
    });
    await expect(bar).toContainText("2 piezas elegidas");
    // El taller lo asignan logística y el admin (D60).
    await expect(
      bar.getByRole("button", { name: "Asignar taller" }),
    ).toHaveCount(0);
    await bar.getByLabel("Cambiar estado a…").click();
    await page.getByRole("option", { name: "Anular" }).click();
    await bar.getByRole("button", { name: "Aplicar a 2 piezas" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Nota (obligatoria)").fill("Desistió");
    await dialog.getByRole("button", { name: "Confirmar: Anular" }).click();
    await expect(restorationStatus(page)).toHaveText("Anulada");
    await expect(card(page, `${r.code}-1`)).toContainText("Anulado");
    await expect(card(page, `${r.code}-2`)).toContainText("Anulado");
  });

  test("logística envía en bloque al taller", async ({ page, loginAs }) => {
    const r = await seedRestoration([
      { description: "Cubierto 1", status: "aprobada", arrived: true },
      { description: "Cubierto 2", status: "aprobada", arrived: true },
    ]);
    await loginAs("logistica");
    await page.goto(`/restauraciones/${r.id}`);
    const bar = page.getByRole("region", {
      name: "Acciones para las piezas elegidas",
    });
    await bar.getByLabel("Cambiar estado a…").click();
    await page.getByRole("option", { name: "Enviar al taller" }).click();
    await bar.getByRole("button", { name: "Aplicar a 2 piezas" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Taller").click();
    await page.getByRole("option", { name: workshopName }).click();
    await dialog
      .getByRole("button", { name: "Confirmar: Enviar al taller" })
      .click();
    await expect(card(page, `${r.code}-1`)).toContainText("En restauración");
    await expect(card(page, `${r.code}-2`)).toContainText("En restauración");
  });

  test("cada rol ve solo sus acciones", async ({ page, loginAs }) => {
    const r = await seedRestoration([
      { description: "Pieza registrada" },
      { description: "Pieza en tienda", status: "aprobada", arrived: true },
    ]);
    await loginAs("logistica");
    await page.goto(`/restauraciones/${r.id}`);
    // Logística no consulta, aprueba ni anula; la pieza ya está en la tienda (P48).
    // Su menú solo lleva al detalle de la pieza.
    expect(await pieceActionNames(page, `${r.code}-1`)).toEqual([
      "Ver detalle",
    ]);

    await loginAs("ventas");
    await page.goto(`/restauraciones/${r.id}`);
    const enTienda = await pieceActionNames(page, `${r.code}-2`);
    expect(enTienda).toContain("Anular");
    expect(enTienda).not.toContain("Enviar al taller");
  });

  test("rechazo, sin arreglo desde Interno y devolución al cliente (P47, P50)", async ({
    page,
    loginAs,
  }) => {
    const r = await seedRestoration([
      // El cliente rechaza cuando responde a la cotización (P50).
      { description: "Copa rechazada", arrived: true, status: "en_espera" },
      {
        description: "Fuente sin arreglo",
        arrived: true,
        status: "enviada_taller",
        workshop: true,
      },
      { description: "Jarra que sí se hace", arrived: true },
    ]);
    await loginAs("ventas");
    await page.goto(`/restauraciones/${r.id}`);
    await pieceAction(page, `${r.code}-1`, "Rechazar");
    let dialog = page.getByRole("dialog");
    await dialog.getByLabel("Nota (obligatoria)").fill("No acepta el precio");
    await dialog.getByRole("button", { name: "Confirmar: Rechazar" }).click();
    await expect(card(page, `${r.code}-1`)).toContainText(
      "Rechazado (cliente)",
    );

    await loginAs("logistica");
    await page.goto(`/restauraciones/${r.id}`);
    await pieceAction(page, `${r.code}-2`, "No tiene arreglo");
    dialog = page.getByRole("dialog");
    await dialog
      .getByLabel("Nota (obligatoria)")
      .fill("El taller dice que la base está rota");
    await dialog
      .getByRole("button", { name: "Confirmar: No tiene arreglo" })
      .click();
    await expect(card(page, `${r.code}-2`)).toContainText("No tiene arreglo");
    await expect(card(page, `${r.code}-2`)).toContainText("En tienda");

    await pieceAction(page, `${r.code}-1`, "Devolver al cliente");
    await expect(card(page, `${r.code}-1`)).toContainText("Entregada");
    // El menú se actualiza cuando la página trae el cambio guardado.
    await expect
      .poll(() => pieceActionNames(page, `${r.code}-1`))
      .not.toContain("Devolver al cliente");
  });

  test("ventas marca una pieza como urgente", async ({ page, loginAs }) => {
    const r = await seedRestoration([{ description: "Bandeja urgente" }]);
    const code = `${r.code}-1`;
    await loginAs("ventas");
    await page.goto(`/restauraciones/${r.id}`);
    await pieceAction(page, code, "Editar");
    const dialog = page.getByRole("dialog");
    // Ventas ve el taller pero no lo cambia (D60).
    await expect(dialog.getByTestId("taller-solo-lectura")).toContainText(
      "Sin asignar",
    );
    await expect(dialog.getByRole("combobox", { name: "Taller" })).toHaveCount(
      0,
    );
    await dialog.getByLabel("Urgente").check();
    await dialog.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(card(page, code)).toContainText("Urgente");
  });

  test("cambia el estado desde el celular @mobile", async ({
    page,
    loginAs,
    isMobile,
  }) => {
    test.skip(!isMobile, "Solo aplica al proyecto móvil");
    const r = await seedRestoration([{ description: "Anillo móvil" }]);
    await loginAs("ventas");
    await page.goto(`/restauraciones/${r.id}`);
    await pieceAction(page, `${r.code}-1`, "Aprobar");
    await expect(card(page, `${r.code}-1`)).toContainText("Aprobada");
    const scrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    expect(scrollWidth).toBeLessThanOrEqual(
      page.viewportSize()?.width ?? Infinity,
    );
  });
});
