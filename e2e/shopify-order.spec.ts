import type { APIRequestContext, Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import { pieceAction, pieceActionNames, pieceRow } from "./support/pieces";
import { adminClient } from "./support/supabase";

// Shopify con el Shopify falso: desde el 2026-10-19 un pedido pagado por pago (ya no
// se crea la orden con las piezas); las guías antiguas siguen editando y preparando
// su orden de piezas (Fase 9).
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

const customers = new Map<string, string>();

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
  customers.set(data.id, customer.id);
  return data.id;
}

/**
 * Guía antigua: ya tenía su orden con una línea por pieza (antes del 2026-10-19). Se
 * crea en el Shopify falso y se guarda en la restauración.
 */
async function legacyOrder(
  request: APIRequestContext,
  clientId: string,
  r: { id: string; code: string },
  prices: string[],
) {
  const response = await request.post("/api/test/shopify", {
    data: {
      action: "order",
      input: {
        customerId: customers.get(clientId),
        lines: prices.map((price, i) => ({
          title: `Restauración ${r.code}-${i + 1}`,
          price,
          quantity: 1,
        })),
        tags: ["restauracion", r.code],
      },
    },
  });
  const { order } = (await response.json()) as {
    order: { id: string; name: string };
  };
  const { error } = await adminClient()
    .from("restorations")
    .update({ shopify_order_id: order.id, shopify_order_name: order.name })
    .eq("id", r.id);
  if (error) throw error;
}

/** Restauración con dos piezas (S/ 100 y S/ 50). */
async function seedRestoration(
  clientId: string,
  // Al crédito: sin adelanto al aprobar ni saldo que bloquee la entrega (11.2).
  paymentType: "credito" | "contado" = "credito",
) {
  const admin = adminClient();
  const { data: r, error } = await admin
    .from("restorations")
    .insert({ client_id: clientId, payment_type: paymentType })
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

test.describe("Shopify al aprobar y cobrar", () => {
  test.afterAll(async () => {
    const admin = adminClient();
    await admin
      .from("shopify_sync_jobs")
      .delete()
      .in("entity_id", restorationIds);
    await admin.from("payments").delete().in("restoration_id", restorationIds);
    await admin.from("pieces").delete().in("restoration_id", restorationIds);
    await admin.from("restorations").delete().in("id", restorationIds);
    await admin.from("clients").delete().in("id", clientIds);
  });

  test("aprobar todas las piezas ya no crea la orden con las piezas", async ({
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
    await approve(page, `${r.code}-2`);
    await expect(page.getByTestId("estado-restauracion")).toHaveText(
      "Aprobada",
    );
    await page.reload();
    await expect(page.getByTestId("orden-shopify")).toHaveCount(0);
    expect(await fakeOrders(request, r.code)).toEqual([]);
  });

  test("si Shopify falla al crear el pedido de un pago queda en error y Reintentar lo crea una sola vez", async ({
    page,
    request,
    loginAs,
  }) => {
    const r = await seedRestoration(
      await seedClient(request, `Falla${run}`),
      "contado",
    );
    await loginAs("ventas");
    await page.goto(`/restauraciones/${r.id}`);
    await approve(page, `${r.code}-1`);
    // Con la página al día, la última pieza ofrece registrar el adelanto: sin pago.
    await page.reload();
    await pieceAction(page, `${r.code}-2`, "Aprobar");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Aprobar sin pago" })
      .click();
    await expect(pieceRow(page, `${r.code}-2`)).toContainText("Aprobada");

    await request.post("/api/test/shopify", {
      data: {
        action: "fail",
        method: "createOrder",
        kind: "user",
        message: "Rechazo de prueba",
        // Solo el pedido de esta guía (otros archivos corren a la vez).
        match: r.code,
      },
    });
    await page.getByRole("tab", { name: "Pagos" }).click();
    await page.getByRole("button", { name: "Registrar pago" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("combobox", { name: "Método" }).click();
    await page.getByRole("option", { name: "Yape" }).click();
    await dialog.getByLabel("Monto (S/)").fill("60");
    await dialog.getByRole("button", { name: "Guardar pago" }).click();
    await expect(page.getByText("Pago de S/ 60.00 registrado.")).toBeVisible();
    await expect(page.getByTestId("estado-shopify")).toHaveText(
      "Shopify: Error",
      { timeout: 20_000 },
    );
    expect(await fakeOrders(request, r.code)).toEqual([]);

    await page.getByRole("button", { name: "Reintentar" }).click();
    await expect(
      page.getByText("Reintentando la sincronización con Shopify."),
    ).toBeVisible();
    await expect
      .poll(
        async () => (await fakeOrders(request, r.code)).map((o) => o.name),
        {
          timeout: 20_000,
        },
      )
      .toEqual([`Adelanto Guía ${r.code} A1`]);
    await page.reload();
    await page.getByRole("tab", { name: "Pagos" }).click();
    await expect(page.getByTestId("pago")).toContainText(
      `Adelanto Guía ${r.code} A1`,
    );
  });

  test("logística no ve la orden ni su sincronización", async ({
    page,
    loginAs,
  }) => {
    await loginAs("logistica");
    await page.goto(`/restauraciones/${restorationIds[1]}`);
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

test.describe("Guía antigua: cambios a su orden de piezas (Pasos 9.2 y 9.3)", () => {
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
    await legacyOrder(request, clientId, r, ["100.00", "50.00"]);
    await page.reload();
    await expect(page.getByTestId("orden-shopify")).toBeVisible();
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
    await legacyOrder(request, clientId, r, ["100.00", "50.00"]);
    await page.reload();
    await expect(page.getByTestId("orden-shopify")).toBeVisible();
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
    await legacyOrder(request, clientId, r, ["90.00"]);
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
