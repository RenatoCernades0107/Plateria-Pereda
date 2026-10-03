import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  calls: [] as unknown[][],
  result: { data: [] as object[] | null, error: null as Error | null },
}));

function builder(table: string) {
  const query: Record<string, unknown> = {};
  for (const method of ["select", "order", "eq"]) {
    query[method] = (...args: unknown[]) => {
      mocks.calls.push([table, method, ...args]);
      return query;
    };
  }
  query.then = (resolve: (v: unknown) => void) => resolve(mocks.result);
  return query;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: builder }),
}));

const { listCatalog } = await import("./catalogs");

describe("listCatalog", () => {
  beforeEach(() => {
    mocks.calls = [];
  });

  it("convierte el precio de los servicios a número", async () => {
    mocks.result = {
      data: [
        { id: "s1", name: "Limpieza", suggested_price: "35.00", active: true },
        { id: "s2", name: "Dorado", suggested_price: null, active: true },
      ],
      error: null,
    };
    expect(await listCatalog("services", { onlyActive: true })).toEqual([
      { id: "s1", name: "Limpieza", price: 35, active: true },
      { id: "s2", name: "Dorado", price: null, active: true },
    ]);
    expect(mocks.calls).toContainEqual(["services", "eq", "active", true]);
  });

  it("los otros catálogos no tienen precio", async () => {
    mocks.result = {
      data: [{ id: "m1", name: "Plata", active: false }],
      error: null,
    };
    expect(await listCatalog("materials")).toEqual([
      { id: "m1", name: "Plata", price: null, active: false },
    ]);
    expect(mocks.calls).not.toContainEqual(["materials", "eq", "active", true]);
    await listCatalog("payment_methods", { onlyActive: true });
    expect(mocks.calls).toContainEqual([
      "payment_methods",
      "eq",
      "active",
      true,
    ]);
  });

  it("propaga los errores", async () => {
    mocks.result = { data: null, error: new Error("caída") };
    await expect(listCatalog("services")).rejects.toThrow("caída");
    await expect(listCatalog("materials")).rejects.toThrow("caída");
  });
});
