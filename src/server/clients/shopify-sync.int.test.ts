import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { FakeShopifyGateway, fakeShopify } from "@/server/shopify/fake";

import {
  applyShopifyCustomerChange,
  supabaseClientSyncRepository,
} from "./repository";
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

/** Procesa el job pendiente de ese tipo para el registro, como lo haría el outbox. */
async function processPending(entityId: string, kind: string) {
  const admin = createAdminClient();
  const { data: job, error } = await admin
    .from("shopify_sync_jobs")
    .select("id, kind, entity_table, entity_id, payload, max_attempts")
    .eq("entity_id", entityId)
    .eq("kind", kind)
    .eq("status", "pending")
    .single();
  if (error) throw error;
  const result = await clientJobHandlers(supabaseClientSyncRepository)[kind]!(
    {
      id: job.id,
      kind: job.kind,
      entityTable: job.entity_table,
      entityId: job.entity_id,
      payload: job.payload,
      attempts: 1,
      maxAttempts: job.max_attempts,
    },
    new FakeShopifyGateway(),
  );
  await admin
    .from("shopify_sync_jobs")
    .update({ status: "ok", completed_at: new Date().toISOString() })
    .eq("id", job.id);
  return result;
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

  it("la edición viaja a Shopify y los cambios de Shopify vuelven sin eco (P16)", async () => {
    // Sin reiniciar el Shopify falso: los ids siguen la secuencia del test anterior.
    const ventas = await ventasClient();
    const RUN2 = `${Number(RUN) + 1}`.padStart(8, "0");
    const { data: client } = await ventas
      .from("clients")
      .insert({
        kind: "persona",
        first_name: "Edición",
        last_name: RUN2,
        phone: `+519${RUN2}`,
      })
      .select("id")
      .single();
    created.push(client!.id);
    const { shopifyCustomerId } = (await processPending(
      client!.id,
      "customer.create",
    )) as { shopifyCustomerId: string };

    await ventas
      .from("clients")
      .update({ first_name: "Editada", email: `edit-${RUN2}@correo.pe` })
      .eq("id", client!.id);
    await processPending(client!.id, "customer.update");
    expect(
      await new FakeShopifyGateway().getCustomer(shopifyCustomerId),
    ).toMatchObject({
      firstName: "Editada",
      email: `edit-${RUN2}@correo.pe`,
    });

    expect(
      await applyShopifyCustomerChange({
        customerId: shopifyCustomerId,
        firstName: "Desde Shopify",
        lastName: RUN2,
        email: `edit-${RUN2}@correo.pe`,
        phone: `+519${RUN2}`,
      }),
    ).toBe(1);
    const admin = createAdminClient();
    const { data: saved } = await admin
      .from("clients")
      .select("first_name")
      .eq("id", client!.id)
      .single();
    expect(saved!.first_name).toBe("Desde Shopify");
    const { count } = await admin
      .from("shopify_sync_jobs")
      .select("id", { count: "exact", head: true })
      .eq("entity_id", client!.id)
      .eq("status", "pending");
    expect(count).toBe(0);
  });
});
