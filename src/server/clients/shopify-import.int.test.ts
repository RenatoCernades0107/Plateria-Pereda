import { afterAll, describe, expect, it } from "vitest";

import { createAdminClient } from "@/lib/supabase/admin";
import type { ShopifyGateway } from "@/server/shopify/gateway";
import type { ShopifyCustomer } from "@/server/shopify/types";

import { importCustomerWithAdmin } from "./repository";
import { importShopifyCustomers } from "./shopify-import";

const RUN = `${Date.now()}`.slice(-7);
const gid = (i: number) => `gid://shopify/Customer/8${RUN}${i}`;

const customers: ShopifyCustomer[] = Array.from({ length: 5 }, (_, i) => ({
  id: gid(i),
  firstName: i === 4 ? "" : `Importado${i}`,
  lastName: `Prueba ${RUN}`,
  displayName: `Importado${i} Prueba ${RUN}`,
  email: `importado${i}-${RUN}@correo.pe`,
  phone: `+5197${RUN}${i}`,
  note: "",
  updatedAt: "2026-10-04T00:00:00Z",
}));

/** Tienda con ids propios para no chocar con otros tests que usan el Shopify falso. */
const gateway = {
  async searchCustomers(_query: string, { first = 20, after = null } = {}) {
    const start = after ? Number(after) : 0;
    const items = customers.slice(start, start + first);
    const end = start + items.length;
    return {
      items,
      pageInfo: { hasNextPage: end < customers.length, endCursor: String(end) },
    };
  },
} as unknown as ShopifyGateway;

describe("importación de clientes de Shopify", () => {
  afterAll(async () => {
    const admin = createAdminClient();
    await admin
      .from("clients")
      .delete()
      .in(
        "shopify_customer_id",
        customers.map((c) => c.id),
      );
  });

  it("ejecutarla dos veces no duplica clientes", async () => {
    const first = await importShopifyCustomers({
      gateway,
      importCustomer: importCustomerWithAdmin,
      pageSize: 2,
    });
    expect(first).toMatchObject({ created: 5, failed: 0, nextCursor: null });

    customers[0]!.firstName = "Renombrado";
    const second = await importShopifyCustomers({
      gateway,
      importCustomer: importCustomerWithAdmin,
      pageSize: 2,
    });
    expect(second).toMatchObject({ created: 0, updated: 1, unchanged: 4 });

    const admin = createAdminClient();
    const { data } = await admin
      .from("clients")
      .select("id, first_name, last_name, shopify_customer_id")
      .in(
        "shopify_customer_id",
        customers.map((c) => c.id),
      )
      .order("shopify_customer_id");
    expect(data).toHaveLength(5);
    expect(data![0]!.first_name).toBe("Renombrado");
    // Sin nombres en Shopify se usan los apellidos.
    expect(data![4]).toMatchObject({
      first_name: `Prueba ${RUN}`,
      last_name: "",
    });

    // Lo importado no se devuelve a Shopify.
    const { count } = await admin
      .from("shopify_sync_jobs")
      .select("id", { count: "exact", head: true })
      .eq("entity_table", "clients")
      .in(
        "entity_id",
        data!.map((c) => c.id),
      );
    expect(count).toBe(0);
  });
});
