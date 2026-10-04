import { beforeEach, describe, expect, it, vi } from "vitest";

import { FakeShopifyGateway, fakeShopify } from "@/server/shopify/fake";

import {
  importShopifyCustomers,
  type ImportCustomerInput,
  type ImportOutcome,
} from "./shopify-import";

/** BD en memoria con la misma regla de idempotencia que la función de la BD. */
function memoryImporter() {
  const db = new Map<string, ImportCustomerInput>();
  const importCustomer = vi.fn(
    async (input: ImportCustomerInput): Promise<ImportOutcome> => {
      const current = db.get(input.customerId);
      db.set(input.customerId, input);
      if (!current) return "created";
      return JSON.stringify(current) === JSON.stringify(input)
        ? "unchanged"
        : "updated";
    },
  );
  return { db, importCustomer };
}

describe("importShopifyCustomers", () => {
  let gateway: FakeShopifyGateway;

  beforeEach(async () => {
    fakeShopify.reset();
    gateway = new FakeShopifyGateway();
    for (let i = 1; i <= 5; i++) {
      await gateway.createCustomer({
        firstName: i === 5 ? "" : `Cliente${i}`,
        lastName: "Prueba",
        email: `cliente${i}@correo.pe`,
        phone: `+5199900000${i}`,
      });
    }
  });

  it("pagina todos los clientes y al repetir no duplica", async () => {
    const { db, importCustomer } = memoryImporter();
    const first = await importShopifyCustomers({
      gateway,
      importCustomer,
      pageSize: 2,
    });
    expect(first).toMatchObject({
      created: 5,
      updated: 0,
      unchanged: 0,
      failed: 0,
      nextCursor: null,
    });
    expect(db.size).toBe(5);

    const second = await importShopifyCustomers({
      gateway,
      importCustomer,
      pageSize: 2,
    });
    expect(second).toMatchObject({ created: 0, unchanged: 5 });
    expect(db.size).toBe(5);
  });

  it("envía los datos normalizados y el nombre de respaldo", async () => {
    const { db, importCustomer } = memoryImporter();
    await importShopifyCustomers({ gateway, importCustomer });
    const sinNombre = [...db.values()].find((c) => c.firstName === "");
    expect(sinNombre).toMatchObject({
      lastName: "Prueba",
      fallbackName: "Prueba",
      email: "cliente5@correo.pe",
      phone: "+51999000005",
    });
  });

  it("un cliente que falla no detiene la importación", async () => {
    const importCustomer = vi
      .fn()
      .mockRejectedValueOnce(new Error("violación de restricción"))
      .mockResolvedValue("created");
    const summary = await importShopifyCustomers({ gateway, importCustomer });
    expect(summary.created).toBe(4);
    expect(summary.failed).toBe(1);
    expect(summary.errors).toEqual([
      {
        customerId: expect.stringMatching(/Customer/),
        message: "violación de restricción",
      },
    ]);
  });

  it("si se acaba el tiempo devuelve el cursor y continúa desde ahí", async () => {
    const { db, importCustomer } = memoryImporter();
    const partial = await importShopifyCustomers({
      gateway,
      importCustomer,
      pageSize: 2,
      deadline: 0,
      now: () => 1,
    });
    expect(partial.created).toBe(2);
    expect(partial.nextCursor).not.toBeNull();

    const rest = await importShopifyCustomers({
      gateway,
      importCustomer,
      pageSize: 2,
      after: partial.nextCursor,
    });
    expect(rest.created).toBe(3);
    expect(db.size).toBe(5);
  });

  it("si Shopify falla al paginar, propaga el error", async () => {
    fakeShopify.failNext("searchCustomers", "unavailable");
    await expect(
      importShopifyCustomers({ gateway, importCustomer: vi.fn() }),
    ).rejects.toThrow("Shopify no responde");
  });
});
