import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  forbidden: false,
  calls: [] as unknown[][],
  result: { error: null as { code: string } | null },
  permission: "" as string,
  deleted: {
    data: [{ id: "00000000-0000-4000-8000-000000000012" }] as { id: string }[],
    error: null as { code: string; message: string } | null,
  },
}));

vi.mock("@/server/auth", () => ({
  requirePermission: async (permission: string) => {
    mocks.permission = permission;
    if (mocks.forbidden) throw new Error("FORBIDDEN");
    return { id: "00000000-0000-4000-8000-000000000014", role: "admin" };
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
        eq: (column: string, value: unknown) => {
          mocks.calls.push(["update", table, row, value]);
          // Se espera directamente o se encadena con `.neq` / `.select`.
          return Object.assign(Promise.resolve(mocks.result), {
            neq: async (_c: string, id: string) => {
              mocks.calls.push(["neq", id]);
              return mocks.result;
            },
            select: async () => ({
              data: mocks.result.error ? null : [{ id: value }],
              error: mocks.result.error,
            }),
          });
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
  setCatalogItemDefault,
  updateCatalogItem,
} = await import("./catalogs-actions");

describe("acciones de catálogos", () => {
  beforeEach(() => {
    mocks.forbidden = false;
    mocks.calls = [];
    mocks.result = { error: null };
    mocks.deleted = {
      data: [{ id: "00000000-0000-4000-8000-000000000012" }],
      error: null,
    };
  });

  it("los servicios guardan el precio sugerido; los materiales solo el nombre", async () => {
    await createCatalogItem("services", { name: "Limpieza", price: "35,5" });
    await createCatalogItem("materials", { name: "Plata 950", price: "99" });
    await updateCatalogItem(
      "payment_methods",
      "00000000-0000-4000-8000-000000000001",
      {
        name: "Visa",
        price: "",
        shopifyName: "Visa",
      },
    );
    expect(mocks.calls).toEqual([
      ["insert", "services", { name: "Limpieza", suggested_price: 35.5 }],
      ["insert", "materials", { name: "Plata 950" }],
      // Los métodos de pago guardan su nombre en Shopify (D34).
      [
        "update",
        "payment_methods",
        { name: "Visa", shopify_name: "Visa" },
        "00000000-0000-4000-8000-000000000001",
      ],
    ]);
  });

  it("edita un servicio y lo desactiva", async () => {
    expect(
      await updateCatalogItem(
        "services",
        "00000000-0000-4000-8000-000000000013",
        { name: "Pulido", price: "" },
      ),
    ).toEqual({ ok: true });
    expect(
      await setCatalogItemActive(
        "services",
        "00000000-0000-4000-8000-000000000013",
        false,
      ),
    ).toEqual({
      ok: true,
    });
    expect(mocks.calls).toEqual([
      [
        "update",
        "services",
        { name: "Pulido", suggested_price: null },
        "00000000-0000-4000-8000-000000000013",
      ],
      // Al desactivarlo deja de ser el servicio por defecto.
      [
        "update",
        "services",
        { active: false, is_default: false },
        "00000000-0000-4000-8000-000000000013",
      ],
    ]);
  });

  it("marca un material o servicio por defecto quitándole la marca al anterior", async () => {
    expect(
      await setCatalogItemDefault(
        "materials",
        "00000000-0000-4000-8000-000000000012",
        true,
      ),
    ).toEqual({
      ok: true,
    });
    expect(
      await setCatalogItemDefault(
        "services",
        "00000000-0000-4000-8000-000000000013",
        false,
      ),
    ).toEqual({
      ok: true,
    });
    expect(
      await setCatalogItemActive(
        "payment_methods",
        "00000000-0000-4000-8000-000000000001",
        false,
      ),
    ).toEqual({
      ok: true,
    });
    expect(mocks.permission).toBe("configuracion.gestionar");
    expect(mocks.calls).toEqual([
      ["update", "materials", { is_default: false }, true],
      ["neq", "00000000-0000-4000-8000-000000000012"],
      [
        "update",
        "materials",
        { is_default: true },
        "00000000-0000-4000-8000-000000000012",
      ],
      [
        "update",
        "services",
        { is_default: false },
        "00000000-0000-4000-8000-000000000013",
      ],
      // Los métodos de pago no tienen uno por defecto.
      [
        "update",
        "payment_methods",
        { active: false },
        "00000000-0000-4000-8000-000000000001",
      ],
    ]);
  });

  it("no marca por defecto uno desactivado ni catálogos sin esa opción", async () => {
    mocks.result = { error: { code: "23514" } };
    expect(
      await setCatalogItemDefault(
        "services",
        "00000000-0000-4000-8000-000000000013",
        false,
      ),
    ).toEqual({
      error: "Activa el ítem antes de marcarlo por defecto.",
    });
    mocks.calls = [];
    expect(
      await setCatalogItemDefault(
        "payment_methods" as never,
        "00000000-0000-4000-8000-000000000001",
        true,
      ),
    ).toEqual({ error: "Catálogo inválido." });
    expect(mocks.calls).toEqual([]);
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
      await updateCatalogItem(
        "materials",
        "00000000-0000-4000-8000-000000000012",
        { name: "Oro", price: "" },
      ),
    ).toEqual({ error: "No se pudo guardar el ítem." });
    expect(
      await createCatalogItem("materials", { name: "Oro", price: "" }),
    ).toEqual({
      error: "No se pudo crear el ítem.",
    });
    expect(
      await setCatalogItemActive(
        "materials",
        "00000000-0000-4000-8000-000000000012",
        true,
      ),
    ).toEqual({
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
      await updateCatalogItem(
        "services",
        "00000000-0000-4000-8000-000000000013",
        { name: "x", price: "abc" },
      ),
    ).toEqual({ error: "Revisa los datos ingresados." });
    const unknown = "profiles" as never;
    expect(await createCatalogItem(unknown, { name: "x", price: "" })).toEqual({
      error: "Catálogo inválido.",
    });
    expect(
      await updateCatalogItem(unknown, "00000000-0000-4000-8000-000000000099", {
        name: "x",
        price: "",
      }),
    ).toEqual({
      error: "Catálogo inválido.",
    });
    expect(
      await setCatalogItemActive(
        unknown,
        "00000000-0000-4000-8000-000000000099",
        true,
      ),
    ).toEqual({
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

  it("borra un material, servicio o método de pago sin uso", async () => {
    expect(
      await deleteCatalogItem(
        "materials",
        "00000000-0000-4000-8000-000000000012",
      ),
    ).toEqual({ ok: true });
    expect(
      await deleteCatalogItem(
        "services",
        "00000000-0000-4000-8000-000000000013",
      ),
    ).toEqual({ ok: true });
    expect(
      await deleteCatalogItem(
        "payment_methods",
        "00000000-0000-4000-8000-000000000001",
      ),
    ).toEqual({
      ok: true,
    });
    expect(mocks.permission).toBe("configuracion.gestionar");
    expect(mocks.calls).toEqual([
      ["delete", "materials", "00000000-0000-4000-8000-000000000012"],
      ["delete", "services", "00000000-0000-4000-8000-000000000013"],
      ["delete", "payment_methods", "00000000-0000-4000-8000-000000000001"],
    ]);
  });

  it("si está en uso muestra el aviso de la BD, que sugiere desactivarlo", async () => {
    const message =
      "“Plata 950” está en uso en 3 piezas. Desactívalo en su lugar.";
    mocks.deleted = { data: [], error: { code: "23503", message } };
    expect(
      await deleteCatalogItem(
        "materials",
        "00000000-0000-4000-8000-000000000012",
      ),
    ).toEqual({
      error: message,
    });
  });

  it("no revela otros errores y avisa si no se borró nada", async () => {
    mocks.deleted = {
      data: [],
      error: { code: "XX000", message: "detalle interno" },
    };
    expect(
      await deleteCatalogItem(
        "services",
        "00000000-0000-4000-8000-000000000013",
      ),
    ).toEqual({
      error: "No se pudo eliminar el ítem.",
    });
    // Sin permiso (RLS) o ya borrado: el delete no falla pero no toca filas.
    mocks.deleted = { data: [], error: null };
    expect(
      await deleteCatalogItem(
        "services",
        "00000000-0000-4000-8000-000000000013",
      ),
    ).toEqual({
      error: "No se pudo eliminar el ítem.",
    });
  });

  it("un método de pago que usan pagos muestra el aviso de la BD", async () => {
    const message = "“Yape” está en uso en 12 pagos. Desactívalo en su lugar.";
    mocks.deleted = { data: [], error: { code: "23503", message } };
    expect(
      await deleteCatalogItem(
        "payment_methods",
        "00000000-0000-4000-8000-000000000001",
      ),
    ).toEqual({
      error: message,
    });
  });

  it("los catálogos desconocidos no se borran", async () => {
    expect(
      await deleteCatalogItem(
        "profiles" as never,
        "00000000-0000-4000-8000-000000000099",
      ),
    ).toEqual({
      error: "Catálogo inválido.",
    });
    expect(mocks.calls).toEqual([]);
  });

  it("borrar exige el permiso", async () => {
    mocks.forbidden = true;
    await expect(
      deleteCatalogItem("materials", "00000000-0000-4000-8000-000000000012"),
    ).rejects.toThrow("FORBIDDEN");
    expect(mocks.calls).toEqual([]);
  });
});
