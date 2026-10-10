import type { APIRequestContext, Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import { adminClient } from "./support/supabase";

// Comparten el cliente de prueba: en serie.
test.describe.configure({ mode: "serial" });

const run = `${Date.now()}`.slice(-6);
let clientId = "";
let customerId = "";
const restorationIds: string[] = [];

type FakeOrder = {
  id: string;
  name: string;
  tags: string[];
  lines: { title: string; price: string; fulfilled: boolean }[];
  financials: { total: string };
};

/** La orden del Shopify falso con la etiqueta de la restauración. */
async function fakeOrder(request: APIRequestContext, code: string) {
  const response = await request.get("/api/test/shopify");
  const state = (await response.json()) as { orders: FakeOrder[] };
  return state.orders.find((o) => o.tags.includes(code)) ?? null;
}

/** Restauración de prueba con piezas en la tienda, creada directamente en la BD. */
async function seedRestoration(
  pieces: { description: string; price: number; status?: string }[],
) {
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
        price: p.price,
      } as never)
      .select("id")
      .single();
    if (pieceError) throw pieceError;
    if (p.status) {
      // En Interno y de vuelta del taller: lista para entregar.
      await admin
        .from("pieces")
        .update({
          status: p.status,
          approved_at: new Date().toISOString(),
          first_sent_at: new Date(Date.now() - 60_000).toISOString(),
          last_sent_at: new Date(Date.now() - 60_000).toISOString(),
          last_returned_at: new Date().toISOString(),
        } as never)
        .eq("id", piece!.id);
    }
  }
  return r as { id: string; code: string };
}

const card = (page: Page, code: string) => page.getByTestId(`pieza-${code}`);

async function approve(page: Page, code: string) {
  await card(page, code).getByRole("button", { name: "Aprobar" }).click();
  await expect(card(page, code)).toContainText("Aprobada");
}

test.describe("Orden de Shopify de la restauración (Fase 9)", () => {
  test.beforeAll(async ({ request }) => {
    const response = await request.post("/api/test/shopify", {
      data: {
        action: "customer",
        input: { firstName: `Orden${run}`, lastName: "Prueba" },
      },
    });
    customerId = ((await response.json()) as { customer: { id: string } })
      .customer.id;
    const { data, error } = await adminClient()
      .from("clients")
      .insert({
        kind: "persona",
        first_name: `Orden${run}`,
        last_name: "Prueba",
        shopify_customer_id: customerId,
      })
      .select("id")
      .single();
    if (error) throw error;
    clientId = data.id;
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
  });

  test("al aprobar todas las piezas se crea la orden y anular una la edita", async ({
    page,
    loginAs,
    request,
  }) => {
    const r = await seedRestoration([
      { description: "Fuente orden", price: 150 },
      { description: "Jarra orden", price: 60.5 },
    ]);
    await loginAs("ventas");
    await page.goto(`/restauraciones/${r.id}`);

    // Aprobación parcial: todavía no hay orden.
    await approve(page, `${r.code}-1`);
    await expect(page.getByTestId("orden-shopify")).toHaveCount(0);
    expect(await fakeOrder(request, r.code)).toBeNull();

    await approve(page, `${r.code}-2`);
    await expect(page.getByTestId("orden-shopify")).toContainText(
      /Orden #\d+/,
      { timeout: 30_000 },
    );
    await expect(page.getByTestId("estado-shopify")).toHaveText(
      "Shopify: Sincronizado",
    );
    const order = await fakeOrder(request, r.code);
    expect(order?.lines.map((l) => [l.title, l.price])).toEqual([
      [`Restauración ${r.code}-1`, "150.00"],
      [`Restauración ${r.code}-2`, "60.50"],
    ]);
    expect(order?.financials.total).toBe("210.50");

    // Anular una pieza (P12): la orden se edita sola.
    await card(page, `${r.code}-2`)
      .getByRole("button", { name: "Anular" })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Nota (obligatoria)").fill("Error de registro");
    await dialog.getByRole("button", { name: "Confirmar: Anular" }).click();
    await expect(card(page, `${r.code}-2`)).toContainText("Anulado");
    await expect
      .poll(async () => (await fakeOrder(request, r.code))?.financials.total, {
        timeout: 30_000,
      })
      .toBe("150.00");
  });

  test("el admin cambia un precio con motivo y la orden se actualiza", async ({
    page,
    loginAs,
    request,
  }) => {
    const r = await seedRestoration([
      { description: "Copa precio", price: 100 },
    ]);
    await loginAs("ventas");
    await page.goto(`/restauraciones/${r.id}`);
    await approve(page, `${r.code}-1`);
    await expect(page.getByTestId("orden-shopify")).toBeVisible({
      timeout: 30_000,
    });

    await loginAs("admin");
    await page.goto(`/restauraciones/${r.id}`);
    await card(page, `${r.code}-1`)
      .getByRole("button", { name: "Cambiar precio" })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Nuevo precio (S/)").fill("130");
    await dialog.getByRole("button", { name: "Guardar precio" }).click();
    await expect(dialog.getByText("Escribe el motivo")).toBeVisible();
    await dialog
      .getByLabel("Motivo (obligatorio)")
      .fill("Requiere soldadura adicional");
    await dialog.getByRole("button", { name: "Guardar precio" }).click();
    await expect(page.getByText("Precio cambiado")).toBeVisible();
    await expect
      .poll(async () => (await fakeOrder(request, r.code))?.financials.total, {
        timeout: 30_000,
      })
      .toBe("130.00");
  });

  test("entregar una pieza la marca como preparada en Shopify (P44)", async ({
    page,
    loginAs,
    request,
  }) => {
    const r = await seedRestoration([
      { description: "Bandeja entrega", price: 90, status: "enviada_taller" },
    ]);
    // La orden aún no existe: al entregar se procesa el outbox, se crea la orden y la
    // pieza ya entregada queda preparada.
    await loginAs("ventas");
    await page.goto(`/restauraciones/${r.id}`);
    await card(page, `${r.code}-1`)
      .getByRole("button", { name: "Entregar" })
      .click();
    await expect(card(page, `${r.code}-1`)).toContainText("Entregada");
    await expect
      .poll(
        async () =>
          (await fakeOrder(request, r.code))?.lines.map((l) => l.fulfilled),
        { timeout: 30_000 },
      )
      .toEqual([true]);
  });

  test("un error de Shopify se ve y «Reintentar» crea la orden una sola vez", async ({
    page,
    loginAs,
    request,
  }) => {
    // Cliente cuyo id de Shopify no existe: Shopify rechaza la orden.
    await adminClient()
      .from("clients")
      .update({ shopify_customer_id: `gid://shopify/Customer/no-${run}` })
      .eq("id", clientId);
    const r = await seedRestoration([
      { description: "Plato error", price: 40 },
    ]);
    await loginAs("ventas");
    await page.goto(`/restauraciones/${r.id}`);
    await approve(page, `${r.code}-1`);
    await expect(page.getByTestId("estado-shopify")).toHaveText(
      "Shopify: Error",
      { timeout: 30_000 },
    );

    await adminClient()
      .from("clients")
      .update({ shopify_customer_id: customerId })
      .eq("id", clientId);
    await page.getByRole("button", { name: "Reintentar" }).click();
    await expect(page.getByTestId("orden-shopify")).toContainText(
      /Orden #\d+/,
      { timeout: 30_000 },
    );
    const response = await request.get("/api/test/shopify");
    const { orders } = (await response.json()) as { orders: FakeOrder[] };
    expect(orders.filter((o) => o.tags.includes(r.code))).toHaveLength(1);
  });
});
