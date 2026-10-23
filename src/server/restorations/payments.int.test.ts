import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { toDecimalString } from "@/domain/money";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { FakeShopifyGateway, fakeShopify } from "@/server/shopify/fake";
import { processShopifyJobs } from "@/server/shopify-sync/processor";
import { supabaseJobRepository } from "@/server/shopify-sync/repository";

import {
  supabaseOrderWebhookRepository,
  supabaseRestorationOrderRepository,
} from "./order-repository";
import { orderWebhookHandlers } from "./payment-webhooks";
import { restorationOrderHandlers } from "./shopify-order";

// Pagos registrados en el sistema y su envío a Shopify (Paso 11.2, §7.5, P43): un
// pedido pagado por pago (2026-10-19) y, en las guías antiguas, su orden de piezas.
const RUN = `${Date.now()}`.slice(-8);
const created: { clients: string[]; restorations: string[] } = {
  clients: [],
  restorations: [],
};
let customerId = "";
let clientId = "";
let ventas: Awaited<ReturnType<typeof signIn>>;
/** Registra con precios de venta: solo el admin los asigna (D58). */
let pricing: Awaited<ReturnType<typeof signIn>>;

async function signIn(email: string) {
  const client = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { error } = await client.auth.signInWithPassword({
    email,
    password: "Pereda-local-2026",
  });
  if (error) throw error;
  return client;
}

const process_ = () =>
  processShopifyJobs({
    repo: supabaseJobRepository,
    gateway: new FakeShopifyGateway(),
    handlers: restorationOrderHandlers(
      supabaseRestorationOrderRepository,
      () => "http://localhost:3000",
    ),
    batchSize: 50,
  });

/** "A cuenta" 50 % con dos piezas que suman S/ 400. */
async function seed() {
  const { data: r, error } = await pricing
    .rpc("create_restoration", {
      p_client_id: clientId,
      p_contact_id: null as unknown as string,
      p_payment_type: "a_cuenta",
      p_deposit_percent: 50,
      p_notes: "",
      p_pieces: [
        { description: "Fuente", price: "300.00" },
        { description: "Jarra", price: "100.00" },
      ],
    })
    .single();
  if (error) throw error;
  created.restorations.push(r!.id);
  const { data: pieces } = await createAdminClient()
    .from("pieces")
    .select("id")
    .eq("restoration_id", r!.id);
  return { ...r!, pieceIds: pieces!.map((p) => p.id) };
}

const pay = (restorationId: string, amount: number, method = "Efectivo") =>
  ventas
    .from("payments")
    .insert({ restoration_id: restorationId, amount, method_name: method });

const approve = (ids: string[]) =>
  ventas.rpc("change_piece_status", { p_piece_ids: ids, p_to: "aprobada" });

const orderOf = (code: string) =>
  fakeShopify.snapshot().orders.find((o) => o.tags.includes(code))!;

/** Pedidos de los pagos de la guía, en orden. */
const paymentOrders = (code: string) =>
  fakeShopify.snapshot().orders.filter((o) => o.tags.includes(code));

/**
 * Guía antigua: ya tenía su orden con una línea por pieza (antes del 2026-10-19). Se
 * crea en el Shopify falso y se guarda en la restauración, antes de cobrar.
 */
async function legacy(r: { id: string; code: string }) {
  const order = await new FakeShopifyGateway().createOrder({
    customerId,
    lines: [300_00, 100_00].map((cents, i) => ({
      title: `Restauración ${r.code}-${i + 1}`,
      price: toDecimalString(cents),
      quantity: 1,
    })),
    tags: ["restauracion", r.code],
  });
  const { error } = await createAdminClient()
    .from("restorations")
    .update({ shopify_order_id: order.id, shopify_order_name: order.name })
    .eq("id", r.id);
  if (error) throw error;
  return order;
}

const paymentRows = async (restorationId: string) => {
  const { data } = await createAdminClient()
    .from("payments")
    .select(
      "id, kind, amount, method_name, shopify_order_name, shopify_order_id",
    )
    .eq("restoration_id", restorationId)
    .order("created_at");
  return data!;
};

const synced = async (restorationId: string) => {
  const { data } = await createAdminClient()
    .from("payments")
    .select("amount, shopify_synced_at")
    .eq("restoration_id", restorationId)
    .order("created_at");
  return data!.map((p) => [Number(p.amount), p.shopify_synced_at !== null]);
};

beforeAll(async () => {
  fakeShopify.reset();
  customerId = (
    await new FakeShopifyGateway().createCustomer({
      firstName: "Pagos",
      lastName: RUN,
    })
  ).id;
  const { data } = await createAdminClient()
    .from("clients")
    .insert({
      kind: "persona",
      first_name: "Pagos",
      last_name: RUN,
      shopify_customer_id: customerId,
    })
    .select("id")
    .single();
  clientId = data!.id;
  created.clients.push(clientId);
  ventas = await signIn("ventas@pereda.test");
  pricing = await signIn("admin@pereda.test");
});

afterAll(async () => {
  const admin = createAdminClient();
  await admin
    .from("shopify_sync_jobs")
    .delete()
    .in("entity_id", created.restorations);
  await admin
    .from("payments")
    .delete()
    .in("restoration_id", created.restorations);
  await admin
    .from("pieces")
    .delete()
    .in("restoration_id", created.restorations);
  await admin.from("restorations").delete().in("id", created.restorations);
  await admin.from("clients").delete().in("id", created.clients);
});

describe("un pedido de Shopify por pago (2026-10-19)", () => {
  it("cada pago es un pedido «Pagado»: A1, A2… y el que completa el total es el Saldo", async () => {
    const r = await seed();
    expect((await approve(r.pieceIds)).error).toBeNull();
    expect((await pay(r.id, 200, "Yape")).error).toBeNull();
    await process_();
    expect(
      paymentOrders(r.code).map((o) => [o.name, o.financials.financialStatus]),
    ).toEqual([[`Adelanto Guía ${r.code} A1`, "PAID"]]);

    // Un pago en dos métodos: dos pedidos; el segundo completa el total.
    const { error } = await ventas.from("payments").insert([
      { restoration_id: r.id, amount: 100, method_name: "Efectivo" },
      { restoration_id: r.id, amount: 100, method_name: "Plin" },
    ]);
    expect(error).toBeNull();
    await process_();
    expect(
      paymentOrders(r.code).map((o) => [
        o.name,
        o.lines.map((l) => [l.title, l.price]),
        o.financials.financialStatus,
        o.transactions.map((t) => t.gateway),
      ]),
    ).toEqual([
      [
        `Adelanto Guía ${r.code} A1`,
        [[`Adelanto Guía ${r.code} A1`, "200.00"]],
        "PAID",
        ["Yape"],
      ],
      [
        `Adelanto Guía ${r.code} A2`,
        [[`Adelanto Guía ${r.code} A2`, "100.00"]],
        "PAID",
        ["Efectivo"],
      ],
      [
        `Saldo Guía ${r.code}`,
        [[`Saldo Guía ${r.code}`, "100.00"]],
        "PAID",
        ["Plin"],
      ],
    ]);
    expect(await synced(r.id)).toEqual([
      [200, true],
      [100, true],
      [100, true],
    ]);
    const rows = await paymentRows(r.id);
    expect(rows.map((p) => p.shopify_order_id)).toEqual(
      paymentOrders(r.code).map((o) => o.id),
    );
    expect(rows.map((p) => p.shopify_order_name)).toEqual(
      paymentOrders(r.code).map((o) => o.name),
    );
    const { data } = await createAdminClient()
      .from("restorations")
      .select("payment_status, shopify_order_id")
      .eq("id", r.id)
      .single();
    // Sin orden con las piezas.
    expect(data).toEqual({ payment_status: "pagado", shopify_order_id: null });
  });

  it("el adelanto se cobra aunque la guía aún no esté aprobada", async () => {
    const r = await seed();
    expect((await pay(r.id, 50, "Yape")).error).toBeNull();
    await process_();
    expect(paymentOrders(r.code).map((o) => o.name)).toEqual([
      `Adelanto Guía ${r.code} A1`,
    ]);
  });

  it("el reembolso se hace en el pedido del pago elegido, una sola vez", async () => {
    const r = await seed();
    await approve(r.pieceIds);
    await pay(r.id, 200, "Yape");
    await pay(r.id, 100);
    await process_();
    const [yape] = await paymentRows(r.id);
    const admin = await signIn("admin@pereda.test");
    // Sin decir qué pago devuelve, la BD lo rechaza.
    expect(
      (
        await admin.from("payments").insert({
          restoration_id: r.id,
          kind: "reembolso",
          amount: 50,
          method_name: "Yape",
          reason: "Cobro de más",
        })
      ).error?.message,
    ).toBe("Elige el pago que se reembolsa");
    const { error } = await admin.from("payments").insert({
      restoration_id: r.id,
      kind: "reembolso",
      amount: 50,
      method_name: "Yape",
      reason: "Cobro de más",
      refunded_payment_id: yape!.id,
    });
    expect(error).toBeNull();
    await process_();
    expect(
      paymentOrders(r.code).map((o) => [o.name, o.financials.received]),
    ).toEqual([
      [`Adelanto Guía ${r.code} A1`, "150.00"],
      [`Adelanto Guía ${r.code} A2`, "100.00"],
    ]);
    // Repetir la conciliación no reembolsa dos veces.
    await createAdminClient().from("shopify_sync_jobs").insert({
      kind: "payment.sync",
      entity_table: "restorations",
      entity_id: r.id,
    });
    await process_();
    expect(paymentOrders(r.code)[0]!.financials.received).toBe("150.00");
    expect((await synced(r.id)).every(([, sent]) => sent)).toBe(true);
  });

  it("entregada toda la guía, los pedidos de sus pagos quedan preparados", async () => {
    const r = await seed();
    await approve(r.pieceIds);
    await pay(r.id, 200, "Yape");
    await process_();
    const admin = createAdminClient();
    const deliver = (id: string) =>
      admin
        .from("pieces")
        .update({ status: "entregada", delivered_at: new Date().toISOString() })
        .eq("id", id);
    await pay(r.id, 200);
    expect((await deliver(r.pieceIds[0]!)).error).toBeNull();
    await process_();
    expect(
      paymentOrders(r.code).flatMap((o) => o.lines.map((l) => l.fulfilled)),
    ).toEqual([false, false]);
    expect((await deliver(r.pieceIds[1]!)).error).toBeNull();
    await process_();
    expect(
      paymentOrders(r.code).flatMap((o) => o.lines.map((l) => l.fulfilled)),
    ).toEqual([true, true]);
  });
});

describe("guía antigua con su orden de piezas (11.2)", () => {
  it("un pago intermedio queda pendiente y llega con el que completa el saldo", async () => {
    const r = await seed();
    await legacy(r);
    await approve(r.pieceIds);
    await pay(r.id, 200, "Yape");
    await process_();
    // Nada de pedidos por pago: la orden de piezas sigue conciliándose como antes.
    expect(paymentOrders(r.code)).toHaveLength(1);
    expect(orderOf(r.code).financials).toMatchObject({
      financialStatus: "PENDING",
      received: "0.00",
    });

    await pay(r.id, 100);
    await process_();
    expect(await synced(r.id)).toEqual([
      [200, false],
      [100, false],
    ]);

    await pay(r.id, 100, "Plin");
    await process_();
    expect(orderOf(r.code).financials).toMatchObject({
      financialStatus: "PAID",
      received: "400.00",
    });
    expect((await synced(r.id)).every(([, sent]) => sent)).toBe(true);
    // Shopify recibe el total de una vez, con el método del último pago.
    expect(orderOf(r.code).transactions.at(-1)).toMatchObject({
      gateway: "Plin",
    });
    expect((await paymentRows(r.id)).map((p) => p.shopify_order_name)).toEqual([
      null,
      null,
      null,
    ]);
  });
});

describe("pagos hechos en Shopify (11.3)", () => {
  const webhooks = orderWebhookHandlers(
    supabaseOrderWebhookRepository,
    process_,
  );
  const fire = (topic: string, payload: object) =>
    webhooks[topic]!({
      id: 0,
      webhookId: `w-${Math.random()}`,
      topic,
      shopDomain: "pereda-fake.myshopify.com",
      payload: payload as never,
    });
  const payments = async (restorationId: string) => {
    const { data } = await createAdminClient()
      .from("payments")
      .select("kind, amount, source, method_name")
      .eq("restoration_id", restorationId)
      .order("created_at");
    return data!.map((p) => [
      p.kind,
      Number(p.amount),
      p.source,
      p.method_name,
    ]);
  };
  const status = async (restorationId: string) =>
    (
      await createAdminClient()
        .from("restorations")
        .select("paid, payment_status")
        .eq("id", restorationId)
        .single()
    ).data;

  it("guía antigua: un pago parcial hecho en el POS queda en el registro y el estado es Parcial", async () => {
    const r = await seed();
    await legacy(r);
    await approve(r.pieceIds);
    await process_();
    const { id: orderId } = fakeShopify.externalTransaction(
      r.code,
      "150.00",
      "cash",
    );
    // Duplicados y en cualquier orden: el resultado es el mismo.
    await fire("order_transactions/create", {
      order_id: orderId.split("/").pop(),
    });
    await fire("orders/paid", { admin_graphql_api_id: orderId });
    await fire("orders/paid", { admin_graphql_api_id: orderId });
    expect(await payments(r.id)).toEqual([
      ["pago", 150, "shopify", "Efectivo"],
    ]);
    expect(await status(r.id)).toEqual({
      paid: 150,
      payment_status: "parcial",
    });
  });

  it("un pago enviado por el sistema no se duplica al llegar el webhook de su pedido", async () => {
    const r = await seed();
    await approve(r.pieceIds);
    await pay(r.id, 200, "Yape");
    await process_();
    await pay(r.id, 200);
    await process_();
    for (const { id: orderId } of paymentOrders(r.code)) {
      await fire("orders/paid", { admin_graphql_api_id: orderId });
      await fire("orders/updated", { admin_graphql_api_id: orderId });
    }
    expect((await payments(r.id)).map(([, , source]) => source)).toEqual([
      "sistema",
      "sistema",
    ]);
    expect(await status(r.id)).toEqual({ paid: 400, payment_status: "pagado" });
  });

  it("un reembolso hecho en Shopify en el pedido de un pago entra con su pago y recalcula el estado", async () => {
    const r = await seed();
    await approve(r.pieceIds);
    await pay(r.id, 200, "Yape");
    await process_();
    const [yape] = await paymentRows(r.id);
    const { id: orderId } = fakeShopify.externalTransaction(
      `pago-${yape!.id}`,
      "-200.00",
      "Yape",
    );
    await fire("refunds/create", { order_id: orderId.split("/").pop() });
    await fire("refunds/create", { order_id: orderId.split("/").pop() });
    expect(await payments(r.id)).toEqual([
      ["pago", 200, "sistema", "Yape"],
      ["reembolso", 200, "shopify", "Yape"],
    ]);
    const { data } = await createAdminClient()
      .from("payments")
      .select("refunded_payment_id")
      .eq("restoration_id", r.id)
      .eq("kind", "reembolso")
      .single();
    expect(data!.refunded_payment_id).toBe(yape!.id);
    expect(await status(r.id)).toEqual({
      paid: 0,
      payment_status: "reembolsado",
    });
  });

  it("un pago hecho en Shopify sobre el pedido de un pago ya no entra al registro", async () => {
    const r = await seed();
    await approve(r.pieceIds);
    await pay(r.id, 200, "Yape");
    await process_();
    const [yape] = await paymentRows(r.id);
    const { id: orderId } = fakeShopify.externalTransaction(
      `pago-${yape!.id}`,
      "50.00",
      "cash",
    );
    await fire("orders/paid", { admin_graphql_api_id: orderId });
    expect(await payments(r.id)).toEqual([["pago", 200, "sistema", "Yape"]]);
  });

  it("guía antigua: si cambian el cliente de la orden en Shopify, la restauración lo muestra (D31)", async () => {
    const r = await seed();
    await legacy(r);
    await approve(r.pieceIds);
    await process_();
    const other = await new FakeShopifyGateway().createCustomer({
      firstName: "Nuevo",
      lastName: RUN,
    });
    await fire("orders/updated", {
      admin_graphql_api_id: orderOf(r.code).id,
      customer: {
        admin_graphql_api_id: other.id,
        first_name: "Nuevo",
        last_name: RUN,
      },
    });
    const { data } = await createAdminClient()
      .from("restorations")
      .select("clients(first_name, shopify_customer_id)")
      .eq("id", r.id)
      .single();
    expect(data!.clients).toEqual({
      first_name: "Nuevo",
      shopify_customer_id: other.id,
    });
    const { data: client } = await createAdminClient()
      .from("clients")
      .select("id")
      .eq("shopify_customer_id", other.id)
      .single();
    created.clients.push(client!.id);
  });
});
