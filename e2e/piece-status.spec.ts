import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";
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
};

/** Restauración de prueba creada directamente en la BD. */
async function seedRestoration(pieces: NewPiece[]) {
  const admin = adminClient();
  const { data: r, error } = await admin
    .from("restorations")
    .insert({ client_id: clientId, payment_type: "contado" })
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
          first_sent_at: p.workshop ? new Date().toISOString() : null,
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

  test("flujo feliz: registrada → aprobada → recibida → taller → devuelta → entregada", async ({
    page,
    loginAs,
  }) => {
    const r = await seedRestoration([{ description: "Fuente feliz" }]);
    const code = `${r.code}-1`;

    await loginAs("ventas");
    await page.goto(`/restauraciones/${r.id}`);
    await card(page, code).getByRole("button", { name: "Aprobar" }).click();
    await expect(card(page, code)).toContainText("Aprobada");
    await expect(card(page, code)).toContainText("Por recibir");
    await expect(restorationStatus(page)).toHaveText("Aprobada");

    await loginAs("logistica");
    await page.goto(`/restauraciones/${r.id}`);
    await card(page, code)
      .getByRole("button", { name: "Marcar llegada a tienda" })
      .click();
    await expect(card(page, code)).toContainText("Recibida");
    await expect(card(page, code)).toContainText("En tienda");

    await card(page, code)
      .getByRole("button", { name: "Enviar al taller" })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Taller").click();
    await page.getByRole("option", { name: workshopName }).click();
    await dialog
      .getByRole("button", { name: "Confirmar: Enviar al taller" })
      .click();
    await expect(card(page, code)).toContainText("Enviada al taller");
    await expect(card(page, code)).toContainText("En taller");
    await expect(card(page, code)).toContainText(`Taller: ${workshopName}`);
    await expect(restorationStatus(page)).toHaveText("En proceso");

    await card(page, code)
      .getByRole("button", { name: "Recibir del taller" })
      .click();
    await expect(card(page, code)).toContainText("Devuelta por el taller");
    await expect(restorationStatus(page)).toHaveText("Lista");

    // La entrega la hace ventas: completada, logística ya no la ve (D24).
    await loginAs("ventas");
    await page.goto(`/restauraciones/${r.id}`);
    await card(page, code).getByRole("button", { name: "Entregar" }).click();
    await expect(card(page, code)).toContainText("Entregada");
    await expect(restorationStatus(page)).toHaveText("Completada");
  });

  test("consulta: en consulta → en espera → aprobada, y en espera → anulada", async ({
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
      await card(page, code)
        .getByRole("button", { name: "Poner en consulta" })
        .click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("button", { name: /Confirmar/ }).click();
      await expect(
        dialog.getByText("Escribe una nota para este cambio de estado."),
      ).toBeVisible();
      await dialog.getByLabel("Nota (obligatoria)").fill("¿Se repara el asa?");
      await dialog.getByRole("button", { name: /Confirmar/ }).click();
      await expect(card(page, code)).toContainText("En consulta");
      await card(page, code)
        .getByRole("button", { name: "Esperar respuesta" })
        .click();
      await expect(card(page, code)).toContainText(
        "En espera de respuesta del cliente",
      );
    }

    await card(page, `${r.code}-1`)
      .getByRole("button", { name: "Aprobar" })
      .click();
    await expect(card(page, `${r.code}-1`)).toContainText("Aprobada");

    await card(page, `${r.code}-2`)
      .getByRole("button", { name: "Anular" })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Nota (obligatoria)").fill("El cliente no aceptó");
    await dialog.getByRole("button", { name: "Confirmar: Anular" }).click();
    await expect(card(page, `${r.code}-2`)).toContainText("Anulada");
    await expect(restorationStatus(page)).toHaveText("Aprobada");
  });

  test("una pieza que llegó antes de aprobarse pasa a Recibida al aprobarla", async ({
    page,
    loginAs,
  }) => {
    const r = await seedRestoration([
      { description: "Candelabro", arrived: true },
    ]);
    await loginAs("ventas");
    await page.goto(`/restauraciones/${r.id}`);
    await card(page, `${r.code}-1`)
      .getByRole("button", { name: "Aprobar" })
      .click();
    await expect(card(page, `${r.code}-1`)).toContainText("Recibida");
    await expect(card(page, `${r.code}-1`)).toContainText("En tienda");
  });

  test("observada y reenvío al taller", async ({ page, loginAs }) => {
    const r = await seedRestoration([
      {
        description: "Bandeja observada",
        status: "devuelta_taller",
        workshop: true,
      },
    ]);
    const code = `${r.code}-1`;
    await loginAs("ventas");
    await page.goto(`/restauraciones/${r.id}`);
    await card(page, code).getByRole("button", { name: "Observar" }).click();
    let dialog = page.getByRole("dialog");
    await dialog.getByLabel("Nota (obligatoria)").fill("Falta pulir el borde");
    await dialog.getByRole("button", { name: "Confirmar: Observar" }).click();
    await expect(card(page, code)).toContainText("Observada");

    await loginAs("logistica");
    await page.goto(`/restauraciones/${r.id}`);
    await card(page, code)
      .getByRole("button", { name: "Enviar al taller" })
      .click();
    dialog = page.getByRole("dialog");
    // El taller ya asignado viene elegido.
    await dialog
      .getByRole("button", { name: "Confirmar: Enviar al taller" })
      .click();
    await expect(card(page, code)).toContainText("Enviada al taller");
  });

  test("la línea de tiempo muestra usuarios y notas en orden; logística ve solo días y observación", async ({
    page,
    loginAs,
  }) => {
    const r = await seedRestoration([{ description: "Sopera con historia" }]);
    const code = `${r.code}-1`;
    await loginAs("ventas");
    await page.goto(`/restauraciones/${r.id}`);
    await card(page, code)
      .getByRole("button", { name: "Poner en consulta" })
      .click();
    await page
      .getByRole("dialog")
      .getByLabel("Nota (obligatoria)")
      .fill("Consulta inicial");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /Confirmar/ })
      .click();
    await expect(card(page, code)).toContainText("En consulta");
    await card(page, code)
      .getByRole("button", { name: "Esperar respuesta" })
      .click();
    await expect(card(page, code)).toContainText("En espera");
    await card(page, code).getByRole("button", { name: "Aprobar" }).click();
    await expect(card(page, code)).toContainText("Aprobada");

    await page.reload();
    const timeline = card(page, code).getByTestId("linea-tiempo");
    await timeline.getByText("Línea de tiempo").click();
    const events = timeline.getByTestId("evento");
    await expect(events).toHaveCount(4);
    await expect(events.nth(0)).toContainText("Registrada");
    await expect(events.nth(1)).toContainText("En consulta");
    await expect(events.nth(1)).toContainText("Ventas de prueba");
    await expect(events.nth(1)).toContainText("Consulta inicial");
    await expect(events.nth(3)).toContainText("Aprobada");
    await expect(timeline.getByTestId("dias-cumplimiento")).toContainText(
      "(en curso)",
    );

    await page.getByRole("tab", { name: "Historial" }).click();
    await expect(page.getByTestId("resumen-estados")).toContainText(
      "En espera de respuesta del cliente → Aprobada",
    );

    // Observación tras el taller, para el resumen de logística.
    await adminClient()
      .from("pieces")
      .update({
        status: "devuelta_taller",
        first_sent_at: new Date().toISOString(),
      } as never)
      .eq("restoration_id", r.id);
    await page.goto(`/restauraciones/${r.id}`);
    await card(page, code).getByRole("button", { name: "Observar" }).click();
    await page
      .getByRole("dialog")
      .getByLabel("Nota (obligatoria)")
      .fill("Mancha en la tapa");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /Confirmar/ })
      .click();
    await expect(card(page, code)).toContainText("Observada");

    await loginAs("logistica");
    await page.goto(`/restauraciones/${r.id}`);
    await expect(card(page, code).getByTestId("linea-tiempo")).toHaveCount(0);
    const summary = card(page, code).getByTestId("resumen-logistica");
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
    await page.getByLabel(`Elegir ${r.code}-1`).check();
    await page.getByLabel(`Elegir ${r.code}-2`).check();
    const bar = page.getByRole("region", {
      name: "Acciones para las piezas elegidas",
    });
    await expect(bar).toContainText("2 piezas elegidas");
    await bar.getByRole("button", { name: "Anular" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Nota (obligatoria)").fill("Desistió");
    await dialog.getByRole("button", { name: "Confirmar: Anular" }).click();
    await expect(restorationStatus(page)).toHaveText("Anulada");
    await expect(card(page, `${r.code}-1`)).toContainText("Anulada");
    await expect(card(page, `${r.code}-2`)).toContainText("Anulada");
  });

  test("logística envía en bloque al taller", async ({ page, loginAs }) => {
    const r = await seedRestoration([
      { description: "Cubierto 1", status: "recibida" },
      { description: "Cubierto 2", status: "recibida" },
    ]);
    await loginAs("logistica");
    await page.goto(`/restauraciones/${r.id}`);
    await page.getByLabel(`Elegir ${r.code}-1`).check();
    await page.getByLabel(`Elegir ${r.code}-2`).check();
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
    await expect(card(page, `${r.code}-1`)).toContainText("Enviada al taller");
    await expect(card(page, `${r.code}-2`)).toContainText("Enviada al taller");
  });

  test("cada rol ve solo sus acciones", async ({ page, loginAs }) => {
    const r = await seedRestoration([
      { description: "Pieza registrada" },
      { description: "Pieza recibida", status: "recibida" },
    ]);
    await loginAs("logistica");
    await page.goto(`/restauraciones/${r.id}`);
    const registrada = page.getByRole("group", {
      name: `Acciones de ${r.code}-1`,
    });
    await expect(
      registrada.getByRole("button", { name: "Marcar llegada a tienda" }),
    ).toBeVisible();
    for (const name of ["Aprobar", "Poner en consulta", "Anular"]) {
      await expect(registrada.getByRole("button", { name })).toHaveCount(0);
    }

    await loginAs("ventas");
    await page.goto(`/restauraciones/${r.id}`);
    const recibida = page.getByRole("group", {
      name: `Acciones de ${r.code}-2`,
    });
    await expect(
      recibida.getByRole("button", { name: "Anular" }),
    ).toBeVisible();
    await expect(
      recibida.getByRole("button", { name: "Enviar al taller" }),
    ).toHaveCount(0);
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
    await card(page, `${r.code}-1`)
      .getByRole("button", { name: "Aprobar" })
      .click();
    await expect(card(page, `${r.code}-1`)).toContainText("Aprobada");
    const scrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    expect(scrollWidth).toBeLessThanOrEqual(
      page.viewportSize()?.width ?? Infinity,
    );
  });
});
