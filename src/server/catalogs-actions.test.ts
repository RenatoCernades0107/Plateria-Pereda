import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  forbidden: false,
  calls: [] as unknown[][],
  result: { error: null as { code: string } | null },
  permission: "" as string,
  rpc: {
    data: { id: "n1", name: "Oro 18k" } as { id: string; name: string } | null,
    error: null as { code: string } | null,
  },
  refresh: vi.fn(),
}));

vi.mock("@/server/auth", () => ({
  requirePermission: async (permission: string) => {
    mocks.permission = permission;
    if (mocks.forbidden) throw new Error("FORBIDDEN");
    return { id: "a1", role: "admin" };
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: (fn: string, args: object) => ({
      single: async () => {
        mocks.calls.push(["rpc", fn, args]);
        return mocks.rpc;
      },
    }),
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
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  refresh: () => mocks.refresh(),
}));

const {
  createCatalogItem,
  createCatalogOption,
  setCatalogItemActive,
  updateCatalogItem,
} = await import("./catalogs-actions");

describe("acciones de catálogos", () => {
  beforeEach(() => {
    mocks.forbidden = false;
    mocks.calls = [];
    mocks.result = { error: null };
    mocks.rpc = { data: { id: "n1", name: "Oro 18k" }, error: null };
    mocks.refresh.mockReset();
  });

  it("los servicios guardan el precio sugerido; los materiales solo el nombre", async () => {
    await createCatalogItem("services", { name: "Limpieza", price: "35,5" });
    await createCatalogItem("materials", { name: "Plata 950", price: "99" });
    await updateCatalogItem("payment_methods", "p1", {
      name: "Visa",
      price: "",
      shopifyName: "Visa",
    });
    expect(mocks.calls).toEqual([
      ["insert", "services", { name: "Limpieza", suggested_price: 35.5 }],
      ["insert", "materials", { name: "Plata 950" }],
      // Los métodos de pago guardan su nombre en Shopify (D34).
      [
        "update",
        "payment_methods",
        { name: "Visa", shopify_name: "Visa" },
        "p1",
      ],
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

  it("desde la pieza, quien edita restauraciones crea materiales y servicios", async () => {
    expect(await createCatalogOption("materials", "  Oro 18k ")).toEqual({
      ok: true,
      option: { id: "n1", name: "Oro 18k" },
    });
    expect(mocks.permission).toBe("restauraciones.editar");
    expect(mocks.calls).toEqual([
      [
        "rpc",
        "create_catalog_option",
        { p_kind: "materials", p_name: "Oro 18k" },
      ],
    ]);
    // Los demás buscadores de la página lo ofrecen.
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("valida el catálogo y el nombre, y muestra el error de la BD", async () => {
    expect(
      await createCatalogOption("payment_methods" as "materials", "Visa"),
    ).toEqual({ error: "Catálogo inválido." });
    expect(await createCatalogOption("services", "  ")).toEqual({
      error: "Escribe un nombre de hasta 100 caracteres.",
    });
    expect(mocks.calls).toEqual([]);
    mocks.rpc = { data: null, error: { code: "42501" } };
    expect(await createCatalogOption("services", "Dorado")).toEqual({
      error: "No se pudo crear el ítem.",
    });
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
