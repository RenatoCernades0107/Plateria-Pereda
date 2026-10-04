import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { FakeShopifyGateway, fakeShopify } from "@/server/shopify/fake";

import { processShopifyJobs } from "./processor";
import { supabaseJobRepository } from "./repository";

const RUN = `int-${Date.now()}`;

/** Cliente aparte: cada uno abre sus propias conexiones a la base de datos. */
const newAdmin = () =>
  createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

async function insertJobs(count: number, kind: string) {
  const { data, error } = await createAdminClient()
    .from("shopify_sync_jobs")
    .insert(
      Array.from({ length: count }, (_, i) => ({
        kind,
        entity_table: "clients",
        entity_id: `${RUN}-${kind}-${i}`,
        payload: { firstName: `Cliente ${i}` },
      })),
    )
    .select("id");
  if (error) throw error;
  return data.map((r) => r.id);
}

describe("outbox de Shopify en la base de datos", () => {
  beforeAll(async () => {
    // Base local de pruebas: se descartan jobs pendientes de otras corridas.
    await createAdminClient()
      .from("shopify_sync_jobs")
      .delete()
      .in("status", ["pending", "processing"]);
  });

  afterAll(async () => {
    await createAdminClient()
      .from("shopify_sync_jobs")
      .delete()
      .like("entity_id", `${RUN}-%`);
  });

  it("dos procesadores a la vez no toman el mismo job", async () => {
    const ids = await insertJobs(10, "test.concurrencia");
    const [a, b] = await Promise.all(
      [newAdmin(), newAdmin()].map((client) =>
        client.rpc("claim_shopify_jobs", { p_limit: 6 }),
      ),
    );
    expect(a!.error).toBeNull();
    expect(b!.error).toBeNull();
    const takenA = a!.data!.map((j) => j.id);
    const takenB = b!.data!.map((j) => j.id);
    expect(takenA.filter((id) => takenB.includes(id))).toEqual([]);
    // Entre los dos tomaron exactamente los 10 jobs, sin repetir ninguno.
    const byId = (x: number, y: number) => x - y;
    expect([...takenA, ...takenB].sort(byId)).toEqual([...ids].sort(byId));
  });

  it("un job pendiente se procesa con el Shopify falso y queda ok", async () => {
    fakeShopify.reset();
    const [id] = await insertJobs(1, "test.cliente");
    const summary = await processShopifyJobs({
      repo: supabaseJobRepository,
      gateway: new FakeShopifyGateway(),
      handlers: {
        "test.cliente": async (job, gateway) => {
          const { firstName } = job.payload as { firstName: string };
          const customer = await gateway.createCustomer({
            firstName,
            lastName: "",
          });
          return { shopifyId: customer.id };
        },
      },
    });
    expect(summary.ok).toBe(1);

    const { data } = await createAdminClient()
      .from("shopify_sync_jobs")
      .select("status, attempts, result, completed_at, locked_at")
      .eq("id", id!)
      .single();
    expect(data).toMatchObject({
      status: "ok",
      attempts: 1,
      result: { shopifyId: expect.stringContaining("gid://shopify/Customer/") },
      locked_at: null,
    });
    expect(data!.completed_at).not.toBeNull();
    expect(fakeShopify.snapshot().customers[0]?.firstName).toBe("Cliente 0");
  });

  it("un fallo deja el job pendiente para reintentar más tarde", async () => {
    const [id] = await insertJobs(1, "test.falla");
    await processShopifyJobs({
      repo: supabaseJobRepository,
      gateway: new FakeShopifyGateway(),
      handlers: {
        "test.falla": async () => {
          throw new Error("Shopify no responde");
        },
      },
    });
    const { data } = await createAdminClient()
      .from("shopify_sync_jobs")
      .select("status, last_error, next_attempt_at")
      .eq("id", id!)
      .single();
    expect(data?.status).toBe("pending");
    expect(data?.last_error).toBe("Shopify no responde");
    expect(new Date(data!.next_attempt_at).getTime()).toBeGreaterThan(
      Date.now(),
    );
  });
});
