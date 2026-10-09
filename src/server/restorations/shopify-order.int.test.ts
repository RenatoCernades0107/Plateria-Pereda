import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { FakeShopifyGateway, fakeShopify } from "@/server/shopify/fake";
import { processShopifyJobs } from "@/server/shopify-sync/processor";
import { supabaseJobRepository } from "@/server/shopify-sync/repository";

import { supabaseRestorationOrderRepository } from "./order-repository";
import { restorationOrderHandlers } from "./shopify-order";

const RUN = `${Date.now()}`.slice(-8);
const created: { clients: string[]; restorations: string[] } = {
  clients: [],
  restorations: [],
};

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

describe("orden de Shopify al aprobar (9.1)", () => {
  afterAll(async () => {
    const admin = createAdminClient();
    await admin
      .from("shopify_sync_jobs")
      .delete()
      .in("entity_id", created.restorations);
    await admin
      .from("pieces")
      .delete()
      .in("restoration_id", created.restorations);
    await admin.from("restorations").delete().in("id", created.restorations);
    await admin.from("clients").delete().in("id", created.clients);
  });

  it("aprobar la última pieza encola la orden; el job la crea y guarda los ids", async () => {
    fakeShopify.reset();
    const customer = await new FakeShopifyGateway().createCustomer({
      firstName: "Orden",
      lastName: RUN,
    });
    const admin = createAdminClient();
    const { data: client } = await admin
      .from("clients")
      .insert({
        kind: "persona",
        first_name: "Orden",
        last_name: RUN,
        shopify_customer_id: customer.id,
      })
      .select("id")
      .single();
    created.clients.push(client!.id);

    const ventas = await signIn("ventas@pereda.test");
    const { data: restoration, error } = await ventas
      .rpc("create_restoration", {
        p_client_id: client!.id,
        p_contact_id: null as unknown as string,
        p_payment_type: "contado",
        p_deposit_percent: null as unknown as number,
        p_notes: "",
        p_pieces: [
          { description: "Fuente", price: "100.00" },
          { description: "Jarra", price: "33.33" },
        ],
        p_prices_include_igv: false,
      })
      .single();
    expect(error).toBeNull();
    created.restorations.push(restoration!.id);
    const { data: pieces } = await admin
      .from("pieces")
      .select("id, code")
      .eq("restoration_id", restoration!.id)
      .order("number");

    const approve = (ids: string[]) =>
      ventas.rpc("change_piece_status", {
        p_piece_ids: ids,
        p_to: "aprobada",
      });
    const jobs = () =>
      admin
        .from("shopify_sync_jobs")
        .select("id, status, result")
        .eq("kind", "order.create")
        .eq("entity_id", restoration!.id);

    expect((await approve([pieces![0]!.id])).error).toBeNull();
    expect((await jobs()).data).toEqual([]);
    expect((await approve([pieces![1]!.id])).error).toBeNull();
    expect((await jobs()).data).toHaveLength(1);

    await process_();
    const [job] = (await jobs()).data!;
    expect(job!.status).toBe("ok");

    const order = fakeShopify
      .snapshot()
      .orders.find((o) => o.tags.includes(restoration!.code))!;
    // Sin IGV incluido (P13): 100.00 → 118.00 y 33.33 → 39.33.
    expect(order.lines.map((l) => [l.title, l.price])).toEqual([
      [`Restauración ${pieces![0]!.code}`, "118.00"],
      [`Restauración ${pieces![1]!.code}`, "39.33"],
    ]);
    expect(order.customerId).toBe(customer.id);

    const { data: saved } = await admin
      .from("restorations")
      .select(
        "shopify_order_id, shopify_order_name, total, pieces(shopify_line_item_id)",
      )
      .eq("id", restoration!.id)
      .single();
    expect(saved).toMatchObject({
      shopify_order_id: order.id,
      shopify_order_name: order.name,
      total: 157.33,
    });
    expect(saved!.pieces.map((p) => p.shopify_line_item_id).sort()).toEqual(
      order.lines.map((l) => l.id).sort(),
    );

    // Reprocesar no duplica: la restauración ya tiene su orden.
    await admin
      .from("shopify_sync_jobs")
      .update({ status: "pending", next_attempt_at: new Date().toISOString() })
      .eq("id", job!.id);
    await process_();
    expect(
      fakeShopify
        .snapshot()
        .orders.filter((o) => o.tags.includes(restoration!.code)),
    ).toHaveLength(1);
  });
});
