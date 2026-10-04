import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { FakeShopifyGateway, fakeShopify } from "@/server/shopify/fake";

import { supabaseClientSyncRepository } from "./repository";
import { clientJobHandlers } from "./shopify-sync";

const RUN = `${Date.now()}`.slice(-8);
const created: string[] = [];

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

describe("alta de clientes sincronizada con Shopify", () => {
  afterAll(async () => {
    const admin = createAdminClient();
    await admin.from("shopify_sync_jobs").delete().in("entity_id", created);
    await admin.from("clients").delete().in("id", created);
  });

  it("crear un cliente encola su job y al procesarlo guarda el id de Shopify", async () => {
    fakeShopify.reset();
    const ventas = await ventasClient();
    const { data: client, error } = await ventas
      .from("clients")
      .insert({
        kind: "persona",
        first_name: "Integración",
        last_name: RUN,
        phone: `+519${RUN}`,
        email: `int-${RUN}@correo.pe`,
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    created.push(client!.id);

    const admin = createAdminClient();
    const { data: job } = await admin
      .from("shopify_sync_jobs")
      .select(
        "id, kind, entity_table, entity_id, payload, attempts, max_attempts, status",
      )
      .eq("entity_id", client!.id)
      .single();
    expect(job).toMatchObject({ kind: "customer.create", status: "pending" });

    const result = await clientJobHandlers(supabaseClientSyncRepository)[
      "customer.create"
    ]!(
      {
        id: job!.id,
        kind: job!.kind,
        entityTable: job!.entity_table,
        entityId: job!.entity_id,
        payload: job!.payload,
        attempts: 1,
        maxAttempts: job!.max_attempts,
      },
      new FakeShopifyGateway(),
    );

    const { data: saved } = await admin
      .from("clients")
      .select("shopify_customer_id")
      .eq("id", client!.id)
      .single();
    expect(saved!.shopify_customer_id).toMatch(/gid:\/\/shopify\/Customer\//);
    expect(result).toEqual({
      shopifyCustomerId: saved!.shopify_customer_id,
      linked: false,
    });
    expect(fakeShopify.snapshot().customers[0]).toMatchObject({
      email: `int-${RUN}@correo.pe`,
      phone: `+519${RUN}`,
    });
  });
});
