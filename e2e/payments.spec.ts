import type { APIRequestContext, Page } from "@playwright/test";

import {
  FAKE_SHOP_DOMAIN,
  FAKE_WEBHOOK_SECRET,
} from "../src/server/shopify-webhooks/config";
import { signWebhook } from "../src/server/shopify-webhooks/hmac";
import { expect, test } from "./fixtures";
import { openPieceActions, pieceAction } from "./support/pieces";
import { adminClient } from "./support/supabase";

// Pagos desde el sistema y su envío a Shopify (Paso 11.2, §7.5, P43, P45): un pedido
// pagado por pago (2026-10-19).
test.describe.configure({ mode: "serial" });

const run = `${Date.now()}`.slice(-6);
const clientIds: string[] = [];
const restorationIds: string[] = [];

type FakeOrder = {
  id: string;
  name: string;
  tags: string[];
  lines: { title: string; price: string; fulfilled: boolean }[];
  financials: { financialStatus: string; received: string };
};

/** Pedidos de los pagos de la guía, en orden. */
async function fakeOrders(request: APIRequestContext, code: string) {
  const response = await request.get("/api/test/shopify");
  const state = (await response.json()) as { orders: FakeOrder[] };
  return state.orders.filter((o) => o.tags.includes(code));
}

type FakeDraft = { id: string; tags: string[]; orderId: string | null };

/**
 * El empleado abre el borrador de cada pago en Shopify y crea el pedido (sin cobrarlo);
 * Shopify avisa por webhook y el sistema registra el cobro en el pedido.
 */
async function employeeCreatesOrders(
  request: APIRequestContext,
  { id, code }: { id: string; code: string },
  count: number,
) {
  const drafts = async () => {
    const response = await request.get("/api/test/shopify");
    const state = (await response.json()) as { drafts: FakeDraft[] };
    return state.drafts.filter((d) => d.tags.includes(code));
  };
  await expect
    .poll(async () => (await drafts()).length, { timeout: 30_000 })
    .toBe(count);
  for (const draft of (await drafts()).filter((d) => !d.orderId)) {
    await request.post("/api/test/shopify", {
      data: {
        action: "complete-draft",
        tag: draft.tags.find((t) => t.startsWith("pago-")),
      },
    });
    await sendWebhook(
      request,
      "draft_orders/update",
      `e2e-borrador-${draft.id.split("/").pop()}`,
      { admin_graphql_api_id: draft.id },
    );
  }
  // El webhook encola la conciliación: cada pago queda ligado a su pedido y cobrado.
  await expect
    .poll(
      async () => {
        const { data } = await adminClient()
          .from("payments")
          .select("shopify_order_id")
          .eq("restoration_id", id)
          .eq("kind", "pago");
        return (data ?? []).filter((p) => p.shopify_order_id).length;
      },
      { timeout: 30_000 },
    )
    .toBe(count);
}

const summary = async (request: APIRequestContext, code: string) =>
  (await fakeOrders(request, code)).map((o) => [
    o.lines[0]!.title,
    o.financials.financialStatus,
    o.financials.received,
  ]);

/** Webhook firmado como lo manda Shopify. */
async function sendWebhook(
  request: APIRequestContext,
  topic: string,
  webhookId: string,
  payload: object,
) {
  const body = JSON.stringify(payload);
  const response = await request.post("/api/webhooks/shopify", {
    data: body,
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Topic": topic,
      "X-Shopify-Shop-Domain": FAKE_SHOP_DOMAIN,
      "X-Shopify-Webhook-Id": webhookId,
      "X-Shopify-Hmac-Sha256": signWebhook(body, FAKE_WEBHOOK_SECRET),
    },
  });
  expect(response.status()).toBe(200);
}

/** Aprueba la única pieza registrando el adelanto sugerido con ese método. */
async function approveWithDeposit(page: Page, code: string, method: string) {
  await pieceAction(page, `${code}-1`, "Aprobar");
  await (
    await fillPayment(page, method)
  )
    .getByRole("button", { name: "Aprobar y registrar pago" })
    .click();
  await expect(page.getByTestId(`pieza-${code}-1`)).toContainText("Aprobada");
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

/** Restauración con una pieza de S/ 200. */
async function seedRestoration(
  clientId: string,
  paymentType: "a_cuenta" | "contado",
) {
  const admin = adminClient();
  const { data: r, error } = await admin
    .from("restorations")
    .insert({
      client_id: clientId,
      payment_type: paymentType,
      deposit_percent: paymentType === "a_cuenta" ? 50 : null,
    })
    .select("id, code")
    .single();
  if (error) throw error;
  restorationIds.push(r.id);
  const { data: piece, error: pieceError } = await admin
    .from("pieces")
    .insert({
      restoration_id: r.id,
      description: "Fuente",
      price: 200,
    } as never)
    .select("id")
    .single();
  if (pieceError) throw pieceError;
  return { ...r, pieceId: piece!.id };
}

/** La pieza ya fue al taller y volvió: lista para entregar. */
async function markReady(pieceId: string) {
  await adminClient()
    .from("pieces")
    .update({
      status: "aprobada",
      approved_at: new Date().toISOString(),
      first_sent_at: new Date(Date.now() - 60_000).toISOString(),
      last_sent_at: new Date(Date.now() - 60_000).toISOString(),
      last_returned_at: new Date().toISOString(),
    } as never)
    .eq("id", pieceId);
}

async function fillPayment(page: Page, method: string, amount?: string) {
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: "Método" }).click();
  await page.getByRole("option", { name: method }).click();
  if (amount) await dialog.getByLabel("Monto (S/)").fill(amount);
  return dialog;
}

test.describe("Pagos", () => {
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

  test("adelanto al aprobar y saldo antes de entregar → dos pedidos «Pagados» en Shopify", async ({
    page,
    request,
    loginAs,
  }) => {
    const r = await seedRestoration(
      await seedClient(request, `Pago${run}`),
      "a_cuenta",
    );
    await loginAs("ventas");
    await page.goto(`/restauraciones/${r.id}`);

    // Última pieza por aprobar: se ofrece registrar el adelanto (50 %).
    const card = page.getByTestId(`pieza-${r.code}-1`);
    await pieceAction(page, `${r.code}-1`, "Aprobar");
    const approve = await fillPayment(page, "Yape");
    await expect(approve.getByLabel("Monto (S/)")).toHaveValue("100.00");
    await approve
      .getByRole("button", { name: "Aprobar y registrar pago" })
      .click();
    await expect(card).toContainText("Aprobada");
    await expect(page.getByTestId("estado-pago")).toHaveText("Pago parcial");
    // El adelanto es su propio borrador: el empleado crea el pedido y queda pagado.
    await employeeCreatesOrders(request, r, 1);
    await expect
      .poll(() => summary(request, r.code), { timeout: 30_000 })
      .toEqual([[`Adelanto Guía ${r.code} A1`, "PAID", "100.00"]]);

    // Vuelve del taller; antes de entregar se cobra el saldo.
    await markReady(r.pieceId);
    await page.reload();
    await page.getByRole("tab", { name: "Pagos" }).click();
    await page.getByRole("button", { name: "Registrar pago" }).click();
    const pay = await fillPayment(page, "Efectivo");
    await expect(pay.getByLabel("Monto (S/)")).toHaveValue("100.00");
    await pay.getByRole("button", { name: "Guardar pago" }).click();
    await expect(page.getByText("Pago de S/ 100.00 registrado.")).toBeVisible();
    await expect(page.getByTestId("estado-pago")).toHaveText("Pagado");
    await expect(page.getByTestId("pago")).toHaveCount(2);
    await employeeCreatesOrders(request, r, 2);
    await expect
      .poll(() => summary(request, r.code), { timeout: 30_000 })
      .toEqual([
        [`Adelanto Guía ${r.code} A1`, "PAID", "100.00"],
        [`Saldo Guía ${r.code}`, "PAID", "100.00"],
      ]);
    await page.reload();
    await page.getByRole("tab", { name: "Pagos" }).click();
    await expect(page.getByTestId("pago").nth(0)).toContainText(
      `Adelanto Guía ${r.code} A1`,
    );
    await expect(page.getByTestId("pago").nth(1)).toContainText(
      `Saldo Guía ${r.code}`,
    );

    // Pagado: se entrega sin confirmar nada, y los pedidos quedan preparados.
    await page.getByRole("tab", { name: /Piezas/ }).click();
    await pieceAction(page, `${r.code}-1`, "Entregar");
    await expect(card).toContainText("Entregada");
    await expect
      .poll(
        async () =>
          (await fakeOrders(request, r.code)).flatMap((o) =>
            o.lines.map((l) => l.fulfilled),
          ),
        { timeout: 30_000 },
      )
      .toEqual([true, true]);
  });

  test("logística no ve pagos ni «Registrar pago»", async ({
    page,
    loginAs,
  }) => {
    await loginAs("logistica");
    const r = await seedRestoration(clientIds[0]!, "contado");
    await page.goto(`/restauraciones/${r.id}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^RES-/);
    await expect(page.getByRole("tab", { name: "Pagos" })).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Registrar pago" }),
    ).toHaveCount(0);
  });

  test("con saldo pendiente logística no entrega; ventas entrega confirmándolo (P45)", async ({
    page,
    request,
    loginAs,
  }) => {
    const r = await seedRestoration(
      await seedClient(request, `Saldo${run}`),
      "contado",
    );
    await markReady(r.pieceId);
    const card = page.getByTestId(`pieza-${r.code}-1`);

    await loginAs("logistica");
    await page.goto(`/restauraciones/${r.id}`);
    await expect(card.getByText("Falta cobrar el saldo")).toBeVisible();
    await openPieceActions(page, `${r.code}-1`);
    await expect(
      page.getByRole("menuitem", { name: "Entregar", exact: true }),
    ).toBeDisabled();
    await page.keyboard.press("Escape");
    // Logística ve el precio de venta de la pieza, pero no los pagos (P42).
    await expect(card).toContainText("S/ 200.00");
    await expect(page.getByRole("tab", { name: "Pagos" })).toHaveCount(0);

    await loginAs("ventas");
    await page.goto(`/restauraciones/${r.id}`);
    await pieceAction(page, `${r.code}-1`, "Entregar");
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("heading", { name: "Falta cobrar el saldo" }),
    ).toBeVisible();
    await dialog.getByLabel("Nota (opcional)").fill("Cliente de confianza");
    await dialog.getByRole("button", { name: "Entregar igual" }).click();
    await expect(card).toContainText("Entregada");
  });

  test("un reembolso hecho en Shopify en el pedido del adelanto llega por webhook (11.3)", async ({
    page,
    request,
    loginAs,
  }) => {
    const r = await seedRestoration(
      await seedClient(request, `Pos${run}`),
      "a_cuenta",
    );
    await loginAs("ventas");
    await page.goto(`/restauraciones/${r.id}`);
    await approveWithDeposit(page, r.code, "Yape");
    await employeeCreatesOrders(request, r, 1);
    await expect
      .poll(async () => (await fakeOrders(request, r.code)).length, {
        timeout: 30_000,
      })
      .toBe(1);
    const [order] = await fakeOrders(request, r.code);

    // Alguien devuelve S/ 40 desde el panel de Shopify y Shopify avisa.
    await request.post("/api/test/shopify", {
      data: {
        action: "transaction",
        tag: order!.tags.find((t) => t.startsWith("pago-")),
        amount: "-40.00",
        gateway: "Yape",
      },
    });
    const webhookId = `e2e-reembolso-${run}`;
    await sendWebhook(request, "refunds/create", webhookId, {
      order_id: order!.id.split("/").pop(),
    });

    await expect
      .poll(
        async () => {
          await page.reload();
          return page.getByTestId("monto-pagado").textContent();
        },
        { timeout: 30_000 },
      )
      .toBe("S/ 60.00");
    await page.getByRole("tab", { name: "Pagos" }).click();
    await expect(page.getByTestId("pago")).toHaveCount(2);
    await expect(page.getByTestId("pago").nth(1)).toContainText(
      "Hecho en Shopify",
    );
    await expect(page.getByTestId("pago").nth(1)).toContainText(
      `De Adelanto Guía ${r.code} A1`,
    );
    await adminClient()
      .from("shopify_webhook_events")
      .delete()
      .eq("webhook_id", webhookId);
  });

  test("historial con el pedido de cada pago; el admin reembolsa eligiendo el pedido", async ({
    page,
    request,
    loginAs,
  }) => {
    const r = await seedRestoration(
      await seedClient(request, `Reembolso${run}`),
      "a_cuenta",
    );
    await loginAs("ventas");
    await page.goto(`/restauraciones/${r.id}`);
    await approveWithDeposit(page, r.code, "Yape");
    await employeeCreatesOrders(request, r, 1);
    await expect
      .poll(() => summary(request, r.code), { timeout: 30_000 })
      .toEqual([[`Adelanto Guía ${r.code} A1`, "PAID", "100.00"]]);
    await page.reload();
    await page.getByRole("tab", { name: "Pagos" }).click();
    await expect(page.getByTestId("pago")).toContainText("Yape");
    await expect(page.getByTestId("pago")).toContainText(
      `Adelanto Guía ${r.code} A1`,
    );
    // Ventas ve el historial, pero no reembolsa ni resincroniza.
    await expect(page.getByRole("button", { name: "Reembolsar" })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("button", { name: "Resincronizar pagos" }),
    ).toHaveCount(0);

    await loginAs("admin");
    await page.goto(`/restauraciones/${r.id}`);
    await page.getByRole("tab", { name: "Pagos" }).click();
    await expect(
      page.getByRole("button", { name: "Resincronizar pagos" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Reembolsar" }).click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByRole("combobox", { name: "Pago que se devuelve" })
      .click();
    await page
      .getByRole("option", { name: new RegExp(`Adelanto Guía ${r.code} A1`) })
      .click();
    // Por defecto, todo lo que queda de ese pago.
    await expect(dialog.getByLabel("Monto (S/)")).toHaveValue("100.00");
    await dialog.getByRole("combobox", { name: "Método" }).click();
    await page.getByRole("option", { name: "Yape" }).click();
    await dialog.getByLabel("Monto (S/)").fill("30");
    await dialog.getByLabel("Motivo (obligatorio)").fill("Cobro de más");
    await dialog.getByRole("button", { name: "Registrar reembolso" }).click();
    await expect(
      page.getByText("Reembolso de S/ 30.00 registrado."),
    ).toBeVisible();
    await expect
      .poll(() => summary(request, r.code), { timeout: 30_000 })
      .toEqual([[`Adelanto Guía ${r.code} A1`, "PARTIALLY_REFUNDED", "70.00"]]);
    await page.reload();
    await page.getByRole("tab", { name: "Pagos" }).click();
    await expect(page.getByTestId("pago").nth(1)).toContainText(
      `De Adelanto Guía ${r.code} A1`,
    );
  });
});
