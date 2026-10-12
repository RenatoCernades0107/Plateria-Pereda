import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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

// Pagos registrados en el sistema y su envío a Shopify (Paso 11.2, §7.5, P43).
const RUN = `${Date.now()}`.slice(-8);
const created: { clients: string[]; restorations: string[] } = {
  clients: [],
  restorations: [],
};
let customerId = "";
let clientId = "";
let ventas: Awaited<ReturnType<typeof signIn>>;

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

/** "A cuenta" 50 % con dos piezas que suman S/ 400 (IGV incluido). */
async function seed() {
  const { data: r, error } = await ventas
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
      p_prices_include_igv: true,
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

describe("pagos y Shopify (11.2)", () => {
  it("aprobar con adelanto crea la orden «Parcialmente pagada»; el saldo la deja «Pagada»", async () => {
    const r = await seed();
    expect((await approve(r.pieceIds)).error).toBeNull();
    // El adelanto se registra antes de procesar la orden (mismo paso que aprobar).
    expect((await pay(r.id, 200, "Yape")).error).toBeNull();
    await process_();
    expect(orderOf(r.code).financials).toMatchObject({
      financialStatus: "PARTIALLY_PAID",
      received: "200.00",
    });
    expect(await synced(r.id)).toEqual([[200, true]]);

    expect((await pay(r.id, 200)).error).toBeNull();
    await process_();
    expect(orderOf(r.code).financials).toMatchObject({
      financialStatus: "PAID",
      received: "400.00",
    });
    expect(await synced(r.id)).toEqual([
      [200, true],
      [200, true],
    ]);
    const { data } = await createAdminClient()
      .from("restorations")
      .select("payment_status")
      .eq("id", r.id)
      .single();
    expect(data!.payment_status).toBe("pagado");
  });

  it("un pago intermedio queda pendiente y llega con el que completa el saldo", async () => {
    const r = await seed();
    await approve(r.pieceIds);
    await pay(r.id, 200, "Yape");
    await process_();

    await pay(r.id, 100);
    await process_();
    expect(orderOf(r.code).financials.received).toBe("200.00");
    expect(await synced(r.id)).toEqual([
      [200, true],
      [100, false],
    ]);

    await pay(r.id, 100, "Plin");
    await process_();
    expect(orderOf(r.code).financials).toMatchObject({
      financialStatus: "PAID",
      received: "400.00",
    });
    expect((await synced(r.id)).every(([, sent]) => sent)).toBe(true);
    // Shopify recibe el resto de una vez, con el método del último pago.
    expect(orderOf(r.code).transactions.at(-1)).toMatchObject({
      gateway: "Plin",
    });
  });

  it("el reembolso del admin de lo ya cobrado se reembolsa en Shopify", async () => {
    const r = await seed();
    await approve(r.pieceIds);
    await pay(r.id, 200, "Yape");
    await process_();
    const admin = await signIn("admin@pereda.test");
    const { error } = await admin.from("payments").insert({
      restoration_id: r.id,
      kind: "reembolso",
      amount: 50,
      method_name: "Yape",
      reason: "Cobro de más",
    });
    expect(error).toBeNull();
    await process_();
    expect(orderOf(r.code).financials.received).toBe("150.00");
    // Repetir la conciliación no reembolsa dos veces.
    await createAdminClient().from("shopify_sync_jobs").insert({
      kind: "payment.sync",
      entity_table: "restorations",
      entity_id: r.id,
    });
    await process_();
    expect(orderOf(r.code).financials.received).toBe("150.00");
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

  it("un pago parcial hecho en el POS queda en el registro y el estado es Parcial", async () => {
    const r = await seed();
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

  it("un pago enviado por el sistema no se duplica al llegar su webhook", async () => {
    const r = await seed();
    await approve(r.pieceIds);
    await pay(r.id, 200, "Yape");
    await process_();
    await pay(r.id, 200);
    await process_();
    const orderId = orderOf(r.code).id;
    await fire("orders/paid", { admin_graphql_api_id: orderId });
    await fire("orders/updated", { admin_graphql_api_id: orderId });
    expect((await payments(r.id)).map(([, , source]) => source)).toEqual([
      "sistema",
      "sistema",
    ]);
    expect(await status(r.id)).toEqual({ paid: 400, payment_status: "pagado" });
  });

  it("un reembolso hecho en Shopify recalcula el saldo y el estado", async () => {
    const r = await seed();
    await approve(r.pieceIds);
    await pay(r.id, 200, "Yape");
    await process_();
    const { id: orderId } = fakeShopify.externalTransaction(
      r.code,
      "-200.00",
      "Yape",
    );
    await fire("refunds/create", { order_id: orderId.split("/").pop() });
    expect(await payments(r.id)).toEqual([
      ["pago", 200, "sistema", "Yape"],
      ["reembolso", 200, "shopify", "Yape"],
    ]);
    expect(await status(r.id)).toEqual({
      paid: 0,
      payment_status: "reembolsado",
    });
  });

  it("si cambian el cliente de la orden en Shopify, la restauración lo muestra (D31)", async () => {
    const r = await seed();
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
