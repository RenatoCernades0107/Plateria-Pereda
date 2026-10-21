import type { APIRequestContext, Page } from "@playwright/test";

import {
  FAKE_SHOP_DOMAIN,
  FAKE_WEBHOOK_SECRET,
} from "../src/server/shopify-webhooks/config";
import { signWebhook } from "../src/server/shopify-webhooks/hmac";
import { expect, test } from "./fixtures";
import { openPieceActions, pieceAction } from "./support/pieces";
import { adminClient } from "./support/supabase";

// Pagos desde el sistema y su envío a Shopify (Paso 11.2, §7.5, P43, P45).
test.describe.configure({ mode: "serial" });

const run = `${Date.now()}`.slice(-6);
const clientIds: string[] = [];
const restorationIds: string[] = [];

type FakeOrder = {
  tags: string[];
  financials: { financialStatus: string; received: string };
};

async function fakeOrder(request: APIRequestContext, code: string) {
  const response = await request.get("/api/test/shopify");
  const state = (await response.json()) as { orders: FakeOrder[] };
  return state.orders.find((o) => o.tags.includes(code));
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

  test("adelanto al aprobar y saldo antes de entregar → Pagado en el sistema y en Shopify", async ({
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
    await expect
      .poll(async () => (await fakeOrder(request, r.code))?.financials, {
        timeout: 30_000,
      })
      .toEqual(
        expect.objectContaining({
          financialStatus: "PARTIALLY_PAID",
          received: "100.00",
        }),
      );

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
    await expect
      .poll(async () => (await fakeOrder(request, r.code))?.financials, {
        timeout: 30_000,
      })
      .toEqual(
        expect.objectContaining({
          financialStatus: "PAID",
          received: "200.00",
        }),
      );

    // Pagado: se entrega sin confirmar nada.
    await page.getByRole("tab", { name: /Piezas/ }).click();
    await pieceAction(page, `${r.code}-1`, "Entregar");
    await expect(card).toContainText("Entregada");
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

  test("un pago hecho en el POS llega por webhook: pagado, saldo y «Parcial» (11.3)", async ({
    page,
    request,
    loginAs,
  }) => {
    const r = await seedRestoration(
      await seedClient(request, `Pos${run}`),
      "contado",
    );
    await loginAs("ventas");
    await page.goto(`/restauraciones/${r.id}`);
    const card = page.getByTestId(`pieza-${r.code}-1`);
    await pieceAction(page, `${r.code}-1`, "Aprobar");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Aprobar sin pago" })
      .click();
    await expect(card).toContainText("Aprobada");
    await expect(page.getByTestId("orden-shopify")).toBeVisible({
      timeout: 30_000,
    });

    // Alguien cobra S/ 80 en el POS y Shopify avisa con un webhook firmado.
    const response = await request.post("/api/test/shopify", {
      data: {
        action: "transaction",
        tag: r.code,
        amount: "80.00",
        gateway: "cash",
      },
    });
    const { order } = (await response.json()) as { order: { id: string } };
    const webhookId = `e2e-pos-${run}`;
    const body = JSON.stringify({ admin_graphql_api_id: order.id });
    expect(
      (
        await request.post("/api/webhooks/shopify", {
          data: body,
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Topic": "orders/updated",
            "X-Shopify-Shop-Domain": FAKE_SHOP_DOMAIN,
            "X-Shopify-Webhook-Id": webhookId,
            "X-Shopify-Hmac-Sha256": signWebhook(body, FAKE_WEBHOOK_SECRET),
          },
        })
      ).status(),
    ).toBe(200);

    await expect
      .poll(
        async () => {
          await page.reload();
          return page.getByTestId("estado-pago").textContent();
        },
        { timeout: 30_000 },
      )
      .toBe("Pago parcial");
    await expect(page.getByTestId("monto-pagado")).toContainText("S/ 80.00");
    await expect(page.getByTestId("monto-saldo")).toContainText("S/ 120.00");
    await page.getByRole("tab", { name: "Pagos" }).click();
    await expect(page.getByTestId("pago")).toContainText("Hecho en Shopify");
    await adminClient()
      .from("shopify_webhook_events")
      .delete()
      .eq("webhook_id", webhookId);
  });

  test("historial para ventas y admin; «Resincronizar pagos» trae lo hecho en Shopify (11.4)", async ({
    page,
    request,
    loginAs,
  }) => {
    const r = await seedRestoration(
      await seedClient(request, `Resync${run}`),
      "a_cuenta",
    );
    await loginAs("ventas");
    await page.goto(`/restauraciones/${r.id}`);
    await pieceAction(page, `${r.code}-1`, "Aprobar");
    await (
      await fillPayment(page, "Yape")
    )
      .getByRole("button", { name: "Aprobar y registrar pago" })
      .click();
    await expect(page.getByTestId("orden-shopify")).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole("tab", { name: "Pagos" }).click();
    await expect(page.getByTestId("pago")).toContainText("Yape");
    await expect(page.getByTestId("pago")).toContainText("En Shopify");
    // Ventas ve el historial, pero no resincroniza.
    await expect(
      page.getByRole("button", { name: "Resincronizar pagos" }),
    ).toHaveCount(0);

    // Un pago en el POS cuyo webhook no llegó.
    await request.post("/api/test/shopify", {
      data: {
        action: "transaction",
        tag: r.code,
        amount: "30.00",
        gateway: "cash",
      },
    });
    await loginAs("admin");
    await page.goto(`/restauraciones/${r.id}`);
    await page.getByRole("tab", { name: "Pagos" }).click();
    await expect(page.getByTestId("pago")).toHaveCount(1);
    await page.getByRole("button", { name: "Resincronizar pagos" }).click();
    await expect(
      page.getByText("Resincronizando los pagos con Shopify."),
    ).toBeVisible();
    await expect
      .poll(
        async () => {
          await page.reload();
          return page.getByTestId("monto-pagado").textContent();
        },
        { timeout: 30_000 },
      )
      .toBe("S/ 130.00");
    await page.getByRole("tab", { name: "Pagos" }).click();
    await expect(page.getByTestId("pago")).toHaveCount(2);
    await expect(page.getByTestId("pago").nth(1)).toContainText(
      "Hecho en Shopify",
    );
  });
});
