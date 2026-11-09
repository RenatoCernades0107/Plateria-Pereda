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

async function ventasClient(email = "ventas@pereda.test") {
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
    const { data: contacts } = await admin
      .from("contacts")
      .select("id")
      .in("client_id", created);
    const contactIds = (contacts ?? []).map((c) => c.id);
    await admin
      .from("shopify_sync_jobs")
      .delete()
      .in("entity_id", [...created, ...contactIds]);
    await admin.from("contacts").delete().in("id", contactIds);
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

  it("convertir una persona sincronizada crea la Company con su Customer de contacto", async () => {
    // Sin reiniciar el fake: sus ids volverían a empezar y chocarían con los de los
    // otros tests de este archivo.
    const ventas = await ventasClient();
    const { data: client } = await ventas
      .from("clients")
      .insert({
        kind: "persona",
        first_name: "Conversión",
        last_name: RUN,
        email: `conv-${RUN}@correo.pe`,
      })
      .select("id")
      .single();
    created.push(client!.id);
    const { shopifyCustomerId } = (await processPending(
      client!.id,
      "customer.create",
    )) as { shopifyCustomerId: string };

    const args = {
      p_client: client!.id,
      p_legal_name: `Conversión ${RUN} S.A.C.`,
      p_ruc: `20${RUN}5`.slice(0, 11),
      p_phone: `+519${RUN}`,
      p_address: "",
      p_city: "Lima",
      p_region: "LIM",
      p_notes: "",
      p_keep_as_contact: true,
    };
    const denied = await ventas.rpc("convert_client_to_company", args);
    expect(denied.error?.code).toBe("42501");

    const adminUser = await ventasClient("admin@pereda.test");
    const { error } = await adminUser.rpc("convert_client_to_company", args);
    expect(error).toBeNull();

    await processPending(client!.id, "company.create");
    const admin = createAdminClient();
    const { data: contact } = await admin
      .from("contacts")
      .select("id")
      .eq("client_id", client!.id)
      .single();
    await processPending(contact!.id, "contact.create");

    const { data: saved } = await admin
      .from("contacts")
      .select("shopify_customer_id, shopify_company_contact_id")
      .eq("id", contact!.id)
      .single();
    expect(saved!.shopify_customer_id).toBe(shopifyCustomerId);
    const snapshot = fakeShopify.snapshot();
    expect(
      snapshot.customers.filter((c) => c.email === `conv-${RUN}@correo.pe`),
    ).toHaveLength(1);
    expect(
      snapshot.companies.find((c) => c.name === `Conversión ${RUN} S.A.C.`),
    ).toMatchObject({
      name: `Conversión ${RUN} S.A.C.`,
      contacts: [
        {
          id: saved!.shopify_company_contact_id,
          customerId: shopifyCustomerId,
        },
      ],
    });
  });
});
