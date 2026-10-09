import type { APIRequestContext, Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import { adminClient } from "./support/supabase";

// Orden de Shopify al aprobar (Paso 9.1), con el Shopify falso.
test.describe.configure({ mode: "serial" });

const run = `${Date.now()}`.slice(-6);
const clientIds: string[] = [];
const restorationIds: string[] = [];

type FakeOrder = {
  id: string;
  name: string;
  tags: string[];
  lines: { title: string; price: string }[];
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

/** Restauración sin IGV incluido con dos piezas (S/ 100 y S/ 50). */
async function seedRestoration(clientId: string) {
  const admin = adminClient();
  const { data: r, error } = await admin
    .from("restorations")
    .insert({
      client_id: clientId,
      payment_type: "contado",
      prices_include_igv: false,
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
  const card = page.getByTestId(`pieza-${pieceCode}`);
  await card.getByRole("button", { name: "Aprobar" }).click();
  await expect(card).toContainText("Aprobada");
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
    // Sin IGV incluido (P13): cada pieza + 18 %.
    expect(order!.lines.map((l) => [l.title, l.price])).toEqual([
      [`Restauración ${r.code}-1`, "118.00"],
      [`Restauración ${r.code}-2`, "59.00"],
    ]);
    expect(order!.financials.total).toBe("177.00");
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
