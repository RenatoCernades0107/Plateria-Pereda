import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  forbidden: false,
  calls: [] as unknown[][],
  result: { error: null as { code: string } | null },
}));

vi.mock("@/server/auth", () => ({
  requirePermission: async () => {
    if (mocks.forbidden) throw new Error("FORBIDDEN");
    return { id: "a1", role: "admin" };
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => ({
      insert: async (row: object) => {
        mocks.calls.push(["insert", table, row]);
        return mocks.result;
      },
      update: (row: object) => ({
        eq: async (_c: string, id: string) => {
          mocks.calls.push(["update", table, row, id]);
          return mocks.result;
        },
      }),
    }),
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { createCatalogItem, setCatalogItemActive, updateCatalogItem } =
  await import("./catalogs-actions");

describe("acciones de catálogos", () => {
  beforeEach(() => {
    mocks.forbidden = false;
    mocks.calls = [];
    mocks.result = { error: null };
  });

  it("los servicios guardan el precio sugerido; los demás solo el nombre", async () => {
    await createCatalogItem("services", { name: "Limpieza", price: "35,5" });
    await createCatalogItem("materials", { name: "Plata 950", price: "99" });
    await updateCatalogItem("payment_methods", "p1", {
      name: "Yape",
      price: "",
    });
    expect(mocks.calls).toEqual([
      ["insert", "services", { name: "Limpieza", suggested_price: 35.5 }],
      ["insert", "materials", { name: "Plata 950" }],
      ["update", "payment_methods", { name: "Yape" }, "p1"],
    ]);
  });

  it("edita un servicio y lo desactiva", async () => {
    expect(
      await updateCatalogItem("services", "s1", { name: "Pulido", price: "" }),
    ).toEqual({ ok: true });
    expect(await setCatalogItemActive("services", "s1", false)).toEqual({
      ok: true,
    });
    expect(mocks.calls).toEqual([
      ["update", "services", { name: "Pulido", suggested_price: null }, "s1"],
      ["update", "services", { active: false }, "s1"],
    ]);
  });

  it("traduce el nombre duplicado y otros errores", async () => {
    mocks.result = { error: { code: "23505" } };
    expect(
      await createCatalogItem("materials", { name: "Oro", price: "" }),
    ).toEqual({
      error: "Ya existe un ítem con ese nombre.",
    });
    mocks.result = { error: { code: "42501" } };
    expect(
      await updateCatalogItem("materials", "m1", { name: "Oro", price: "" }),
    ).toEqual({ error: "No se pudo guardar el ítem." });
    expect(
      await createCatalogItem("materials", { name: "Oro", price: "" }),
    ).toEqual({
      error: "No se pudo crear el ítem.",
    });
    expect(await setCatalogItemActive("materials", "m1", true)).toEqual({
      error: "No se pudo actualizar el ítem.",
    });
  });

  it("rechaza datos inválidos y catálogos desconocidos", async () => {
    expect(
      await createCatalogItem("services", { name: "", price: "" }),
    ).toEqual({
      error: "Revisa los datos ingresados.",
    });
    expect(
      await updateCatalogItem("services", "s1", { name: "x", price: "abc" }),
    ).toEqual({ error: "Revisa los datos ingresados." });
    const unknown = "profiles" as never;
    expect(await createCatalogItem(unknown, { name: "x", price: "" })).toEqual({
      error: "Catálogo inválido.",
    });
    expect(
      await updateCatalogItem(unknown, "1", { name: "x", price: "" }),
    ).toEqual({
      error: "Catálogo inválido.",
    });
    expect(await setCatalogItemActive(unknown, "1", true)).toEqual({
      error: "Catálogo inválido.",
    });
    expect(mocks.calls).toEqual([]);
  });

  it("exige el permiso", async () => {
    mocks.forbidden = true;
    await expect(
      createCatalogItem("materials", { name: "Oro", price: "" }),
    ).rejects.toThrow("FORBIDDEN");
  });
});
