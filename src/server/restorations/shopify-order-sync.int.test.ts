import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { FakeShopifyGateway, fakeShopify } from "@/server/shopify/fake";

import { supabaseOrderSyncRepository } from "./order-sync-repository";
import { orderJobHandlers } from "./shopify-order-sync";

const RUN = `${Date.now()}`.slice(-8);
const handlers = orderJobHandlers(
  supabaseOrderSyncRepository,
  () => "http://localhost:3000",
);
const gateway = new FakeShopifyGateway();
let clientId = "";
let restorationId = "";

async function ventasClient() {
  const client = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { error } = await client.auth.signInWithPassword({
    email: "ventas@pereda.test",
    password: "Pereda-local-2026",
  });
  if (error) throw error;
  return client;
}

/** Procesa el job pendiente de ese tipo, como lo haría el outbox. */
async function processPending(kind: string) {
  const admin = createAdminClient();
  const { data: job, error } = await admin
    .from("shopify_sync_jobs")
    .select("id, kind, entity_table, entity_id, payload, max_attempts")
    .eq("entity_id", restorationId)
    .eq("kind", kind)
    .eq("status", "pending")
    .single();
  if (error) throw error;
  const result = await handlers[kind]!(
    {
      id: job.id,
      kind: job.kind,
      entityTable: job.entity_table,
      entityId: job.entity_id,
      payload: job.payload,
      attempts: 1,
      maxAttempts: job.max_attempts,
    },
    gateway,
  );
  await admin
    .from("shopify_sync_jobs")
    .update({ status: "ok", completed_at: new Date().toISOString() })
    .eq("id", job.id);
  return result;
}

const order = () => fakeShopify.snapshot().orders[0];

async function pieces() {
  const { data, error } = await createAdminClient()
    .from("pieces")
    .select("id, number, shopify_line_item_id")
    .eq("restoration_id", restorationId)
    .order("number");
  if (error) throw error;
  return data;
}

describe("orden de Shopify de la restauración (Fase 9)", () => {
  afterAll(async () => {
    const admin = createAdminClient();
    await admin
      .from("shopify_sync_jobs")
      .delete()
      .eq("entity_id", restorationId);
    await admin.from("pieces").delete().eq("restoration_id", restorationId);
    await admin.from("restorations").delete().eq("id", restorationId);
    await admin.from("clients").delete().eq("id", clientId);
  });

  it("aprobar la última pieza crea la orden en Shopify y guarda sus ids (9.1)", async () => {
    fakeShopify.reset();
    const customer = await gateway.createCustomer({
      firstName: "Orden",
      lastName: RUN,
      email: `orden-${RUN}@correo.pe`,
      phone: null,
    });
    const admin = createAdminClient();
    const { data: client, error } = await admin
      .from("clients")
      .insert({
        kind: "persona",
        first_name: "Orden",
        last_name: RUN,
        shopify_customer_id: customer.id,
      })
      .select("id")
      .single();
    if (error) throw error;
    clientId = client.id;

    const ventas = await ventasClient();
    const { data: created, error: createError } = await ventas
      .rpc("create_restoration", {
        p_client_id: clientId,
        p_contact_id: null as unknown as string,
        p_payment_type: "contado",
        p_deposit_percent: null as unknown as number,
        p_notes: "",
        p_pieces: [
          { description: "Fuente", price: "120.00" },
          { description: "Jarra", price: "80.50" },
        ],
      })
      .single();
    if (createError) throw createError;
    restorationId = created.id;
    const [p1, p2] = await pieces();

    await ventas.rpc("change_piece_status", {
      p_piece_ids: [p1!.id],
      p_to: "aprobada",
    });
    const { count } = await admin
      .from("shopify_sync_jobs")
      .select("id", { count: "exact", head: true })
      .eq("entity_id", restorationId);
    expect(count).toBe(0);

    const { error: approveError } = await ventas.rpc("change_piece_status", {
      p_piece_ids: [p2!.id],
      p_to: "aprobada",
    });
    expect(approveError).toBeNull();
    await processPending("order.create");

    expect(order()?.lines.map((l) => [l.title, l.price])).toEqual([
      [`Restauración ${created.code}-1`, "120.00"],
      [`Restauración ${created.code}-2`, "80.50"],
    ]);
    const { data: saved } = await admin
      .from("restorations")
      .select("shopify_order_id, shopify_order_name")
      .eq("id", restorationId)
      .single();
    expect(saved).toEqual({
      shopify_order_id: order()?.id,
      shopify_order_name: "#1001",
    });
    expect((await pieces()).map((p) => p.shopify_line_item_id)).toEqual(
      order()?.lines.map((l) => l.id),
    );
  });

  it("anular una pieza edita la orden (9.2)", async () => {
    const ventas = await ventasClient();
    const [, p2] = await pieces();
    const { error } = await ventas.rpc("change_piece_status", {
      p_piece_ids: [p2!.id],
      p_to: "anulada",
      p_note: "El cliente se la llevó",
    });
    expect(error).toBeNull();
    await processPending("order.edit");
    expect(order()?.lines.map((l) => l.price)).toEqual(["120.00"]);
    expect(order()?.financials.total).toBe("120.00");
    expect((await pieces())[1]?.shopify_line_item_id).toBeNull();
  });

  it("entregar una pieza marca su línea como preparada (9.3)", async () => {
    const [p1] = await pieces();
    const { error } = await createAdminClient()
      .from("pieces")
      .update({ status: "entregada", delivered_at: new Date().toISOString() })
      .eq("id", p1!.id);
    expect(error).toBeNull();
    await processPending("order.fulfill");
    expect(order()?.lines.map((l) => l.fulfilled)).toEqual([true]);
  });
});
