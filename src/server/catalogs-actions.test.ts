import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  forbidden: false,
  calls: [] as unknown[][],
  result: { error: null as { code: string } | null },
  permission: "" as string,
  deleted: {
    data: [{ id: "m1" }] as { id: string }[],
    error: null as { code: string; message: string } | null,
  },
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
      delete: () => ({
        eq: (_c: string, id: string) => ({
          select: async () => {
            mocks.calls.push(["delete", table, id]);
            return mocks.deleted;
          },
        }),
      }),
    }),
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const {
  createCatalogItem,
  deleteCatalogItem,
  setCatalogItemActive,
  updateCatalogItem,
} = await import("./catalogs-actions");

describe("acciones de catálogos", () => {
  beforeEach(() => {
    mocks.forbidden = false;
    mocks.calls = [];
    mocks.result = { error: null };
    mocks.deleted = { data: [{ id: "m1" }], error: null };
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

  it("borra un material o servicio sin uso", async () => {
    expect(await deleteCatalogItem("materials", "m1")).toEqual({ ok: true });
    expect(await deleteCatalogItem("services", "s1")).toEqual({ ok: true });
    expect(mocks.permission).toBe("configuracion.gestionar");
    expect(mocks.calls).toEqual([
      ["delete", "materials", "m1"],
      ["delete", "services", "s1"],
    ]);
  });

  it("si está en uso muestra el aviso de la BD, que sugiere desactivarlo", async () => {
    const message =
      "“Plata 950” está en uso en 3 piezas. Desactívalo en su lugar.";
    mocks.deleted = { data: [], error: { code: "23503", message } };
    expect(await deleteCatalogItem("materials", "m1")).toEqual({
      error: message,
    });
  });

  it("no revela otros errores y avisa si no se borró nada", async () => {
    mocks.deleted = {
      data: [],
      error: { code: "XX000", message: "detalle interno" },
    };
    expect(await deleteCatalogItem("services", "s1")).toEqual({
      error: "No se pudo eliminar el ítem.",
    });
    // Sin permiso (RLS) o ya borrado: el delete no falla pero no toca filas.
    mocks.deleted = { data: [], error: null };
    expect(await deleteCatalogItem("services", "s1")).toEqual({
      error: "No se pudo eliminar el ítem.",
    });
  });

  it("los métodos de pago y los catálogos desconocidos no se borran", async () => {
    expect(await deleteCatalogItem("payment_methods", "p1")).toEqual({
      error: "Los métodos de pago solo se desactivan.",
    });
    expect(await deleteCatalogItem("profiles" as never, "1")).toEqual({
      error: "Catálogo inválido.",
    });
    expect(mocks.calls).toEqual([]);
  });

  it("borrar exige el permiso", async () => {
    mocks.forbidden = true;
    await expect(deleteCatalogItem("materials", "m1")).rejects.toThrow(
      "FORBIDDEN",
    );
    expect(mocks.calls).toEqual([]);
  });
});
