import type { APIRequestContext, Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import { pieceAction, pieceActionNames, pieceRow } from "./support/pieces";
import { adminClient } from "./support/supabase";

// Orden de Shopify (Fase 9: crear, editar y preparar), con el Shopify falso.
test.describe.configure({ mode: "serial" });

const run = `${Date.now()}`.slice(-6);
const clientIds: string[] = [];
const restorationIds: string[] = [];

type FakeOrder = {
  id: string;
  name: string;
  tags: string[];
  lines: { title: string; price: string; fulfilled: boolean }[];
  financials: { total: string };
};

async function fakeOrders(request: APIRequestContext, tag: string) {
  const response = await request.get("/api/test/shopify");
  const state = (await response.json()) as { orders: FakeOrder[] };
  return state.orders.filter((o) => o.tags.includes(tag));
}

/** Cliente que existe en el Shopify falso (la orden necesita un comprador real). */
async function seedClient(request: APIRequestContext, name: string) {
  const response = await request.post("/api/test/shopify", {
    data: { action: "customer", input: { firstName: name, lastName: "E2E" } },
  });
  const { customer } = (await response.json()) as { customer: { id: string } };
  const { data, error } = await adminClient()
    .from("clients")
    .insert({
      kind: "persona",
      first_name: name,
      last_name: "E2E",
      shopify_customer_id: customer.id,
    })
    .select("id")
    .single();
  if (error) throw error;
  clientIds.push(data.id);
  return data.id;
}

/** Restauración con dos piezas (S/ 100 y S/ 50). */
async function seedRestoration(clientId: string) {
  const admin = adminClient();
  const { data: r, error } = await admin
    .from("restorations")
    .insert({
      client_id: clientId,
      // Al crédito: sin adelanto al aprobar ni saldo que bloquee la entrega (11.2).
      payment_type: "credito",
    })
    .select("id, code")
    .single();
  if (error) throw error;
  restorationIds.push(r.id);
  for (const [description, price] of [
    ["Fuente", 100],
    ["Jarra", 50],
  ] as const) {
    const { error: pieceError } = await admin
      .from("pieces")
      .insert({ restoration_id: r.id, description, price } as never);
    if (pieceError) throw pieceError;
  }
  return r;
}

async function approve(page: Page, pieceCode: string) {
  await pieceAction(page, pieceCode, "Aprobar");
  await expect(pieceRow(page, pieceCode)).toContainText("Aprobada");
}

test.describe("Orden de Shopify al aprobar", () => {
  test.afterAll(async () => {
    const admin = adminClient();
    await admin
      .from("shopify_sync_jobs")
      .delete()
      .in("entity_id", restorationIds);
    await admin.from("pieces").delete().in("restoration_id", restorationIds);
    await admin.from("restorations").delete().in("id", restorationIds);
    await admin.from("clients").delete().in("id", clientIds);
  });

  test("aprobar todas las piezas crea la orden con sus líneas; una aprobación parcial no", async ({
    page,
    request,
    loginAs,
  }) => {
    const r = await seedRestoration(await seedClient(request, `Orden${run}`));
    await loginAs("ventas");
    await page.goto(`/restauraciones/${r.id}`);

    await approve(page, `${r.code}-1`);
    // Una de dos aprobadas: la guía queda Parcialmente aprobada (P54).
    await expect(page.getByTestId("estado-restauracion")).toHaveText(
      "Parcialmente aprobada",
    );
    await expect(page.getByTestId("orden-shopify")).toHaveCount(0);
    expect(await fakeOrders(request, r.code)).toEqual([]);

    await approve(page, `${r.code}-2`);
    await expect(page.getByTestId("orden-shopify")).toContainText(
      /Orden #\d+/,
      { timeout: 20_000 },
    );
    await expect(page.getByTestId("estado-shopify")).toHaveText(
      "Shopify: Sincronizado",
    );

    const [order, ...others] = await fakeOrders(request, r.code);
    expect(others).toEqual([]);
    // Sin IGV: cada línea lleva el precio de la pieza.
    expect(order!.lines.map((l) => [l.title, l.price])).toEqual([
      [`Restauración ${r.code}-1`, "100.00"],
      [`Restauración ${r.code}-2`, "50.00"],
    ]);
    expect(order!.financials.total).toBe("150.00");
    expect(order!.tags).toEqual(["restauracion", r.code]);
    await expect(page.getByTestId("orden-shopify")).toHaveText(
      `Orden ${order!.name}`,
    );
  });

  test("si Shopify falla queda en error y Reintentar crea la orden una sola vez", async ({
    page,
    request,
    loginAs,
  }) => {
    const r = await seedRestoration(await seedClient(request, `Falla${run}`));
    await request.post("/api/test/shopify", {
      data: {
        action: "fail",
        method: "createOrder",
        kind: "user",
        message: "Rechazo de prueba",
      },
    });
    await loginAs("ventas");
    await page.goto(`/restauraciones/${r.id}`);
    await approve(page, `${r.code}-1`);
    await approve(page, `${r.code}-2`);
    await expect(page.getByTestId("estado-shopify")).toHaveText(
      "Shopify: Error",
      { timeout: 20_000 },
    );
    expect(await fakeOrders(request, r.code)).toEqual([]);

    await page.getByRole("button", { name: "Reintentar" }).click();
    await expect(
      page.getByText("Reintentando la sincronización con Shopify."),
    ).toBeVisible();
    await expect(page.getByTestId("orden-shopify")).toContainText(
      /Orden #\d+/,
      { timeout: 20_000 },
    );
    expect(await fakeOrders(request, r.code)).toHaveLength(1);
  });

  test("logística no ve la orden ni su sincronización", async ({
    page,
    loginAs,
  }) => {
    await loginAs("logistica");
    await page.goto(`/restauraciones/${restorationIds[0]}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^RES-/);
    await expect(page.getByTestId("estado-shopify")).toHaveCount(0);
  });
});

/** Pieza aprobada que ya fue al taller y volvió: lista para entregar. */
async function seedReadyPiece(clientId: string) {
  const admin = adminClient();
  const { data: r, error } = await admin
    .from("restorations")
    .insert({ client_id: clientId, payment_type: "credito" })
    .select("id, code")
    .single();
  if (error) throw error;
  restorationIds.push(r.id);
  const { data: piece, error: pieceError } = await admin
    .from("pieces")
    .insert({
      restoration_id: r.id,
      description: "Bandeja",
      price: 90,
    } as never)
    .select("id")
    .single();
  if (pieceError) throw pieceError;
  await admin
    .from("pieces")
    .update({
      status: "aprobada",
      approved_at: new Date().toISOString(),
      first_sent_at: new Date(Date.now() - 60_000).toISOString(),
      last_sent_at: new Date(Date.now() - 60_000).toISOString(),
      last_returned_at: new Date().toISOString(),
    } as never)
    .eq("id", piece!.id);
  return r;
}

const orderTotal = async (request: APIRequestContext, code: string) =>
  (await fakeOrders(request, code))[0]?.financials.total;

test.describe("Cambios posteriores a la orden (Pasos 9.2 y 9.3)", () => {
  test.afterAll(async () => {
    const admin = adminClient();
    await admin
      .from("shopify_sync_jobs")
      .delete()
      .in("entity_id", restorationIds);
    await admin.from("pieces").delete().in("restoration_id", restorationIds);
    await admin.from("restorations").delete().in("id", restorationIds);
    await admin.from("clients").delete().in("id", clientIds);
  });

  test("anular una pieza edita la orden (P12)", async ({
    page,
    loginAs,
    request,
  }) => {
    const clientId = await seedClient(request, `Edita${run}`);
    const r = await seedRestoration(clientId);
    await loginAs("ventas");
    await page.goto(`/restauraciones/${r.id}`);
    await approve(page, `${r.code}-1`);
    await approve(page, `${r.code}-2`);
    await expect(page.getByTestId("orden-shopify")).toBeVisible({
      timeout: 30_000,
    });
    // 100.00 + 50.00.
    expect(await orderTotal(request, r.code)).toBe("150.00");

    const card = page.getByTestId(`pieza-${r.code}-2`);
    await pieceAction(page, `${r.code}-2`, "Anular");
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Nota (obligatoria)").fill("Error de registro");
    await dialog.getByRole("button", { name: "Confirmar: Anular" }).click();
    await expect(card).toContainText("Anulado");
    await expect
      .poll(() => orderTotal(request, r.code), { timeout: 30_000 })
      .toBe("100.00");
  });

  test("el admin cambia un precio con motivo y la orden se actualiza", async ({
    page,
    loginAs,
    request,
  }) => {
    const clientId = await seedClient(request, `Precio${run}`);
    const r = await seedRestoration(clientId);
    await loginAs("ventas");
    await page.goto(`/restauraciones/${r.id}`);
    await approve(page, `${r.code}-1`);
    await approve(page, `${r.code}-2`);
    await expect(page.getByTestId("orden-shopify")).toBeVisible({
      timeout: 30_000,
    });
    // Ventas también cambia el precio con la orden creada (2026-10-21).
    expect(await pieceActionNames(page, `${r.code}-1`)).toContain(
      "Cambiar precio",
    );

    await loginAs("admin");
    await page.goto(`/restauraciones/${r.id}`);
    await pieceAction(page, `${r.code}-1`, "Cambiar precio");
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Nuevo precio unitario (S/)").fill("120");
    await dialog.getByRole("button", { name: "Guardar precio" }).click();
    await expect(dialog.getByText("Escribe el motivo")).toBeVisible();
    await dialog
      .getByLabel("Motivo (obligatorio)")
      .fill("Requiere soldadura adicional");
    await dialog.getByRole("button", { name: "Guardar precio" }).click();
    await expect(page.getByText("Precio cambiado")).toBeVisible();
    // 120.00, más la Jarra (50.00).
    await expect
      .poll(() => orderTotal(request, r.code), { timeout: 30_000 })
      .toBe("170.00");
  });

  test("entregar una pieza la marca como preparada en Shopify (P44)", async ({
    page,
    loginAs,
    request,
  }) => {
    const clientId = await seedClient(request, `Entrega${run}`);
    const r = await seedReadyPiece(clientId);
    // La orden aún no existe: al entregar se procesa el outbox, se crea la orden
    // y la pieza ya entregada queda preparada.
    await loginAs("ventas");
    await page.goto(`/restauraciones/${r.id}`);
    const card = page.getByTestId(`pieza-${r.code}-1`);
    await pieceAction(page, `${r.code}-1`, "Entregar");
    await expect(card).toContainText("Entregada");
    await expect
      .poll(
        async () =>
          (await fakeOrders(request, r.code))[0]?.lines.map((l) => l.fulfilled),
        { timeout: 30_000 },
      )
      .toEqual([true]);
  });
});
