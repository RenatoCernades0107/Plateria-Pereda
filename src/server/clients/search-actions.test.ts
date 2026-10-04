import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  forbidden: false,
  clients: [] as object[],
  contacts: [] as object[],
  orFilters: [] as string[],
  shopify: vi.fn(),
  getCustomer: vi.fn(),
  existing: null as object | null,
  inserted: vi.fn(),
  insertResult: { data: null as object | null, error: null as object | null },
}));

vi.mock("@/server/auth", () => ({
  requirePermission: async () => {
    if (mocks.forbidden) throw new Error("FORBIDDEN");
    return { id: "u1", role: "ventas" };
  },
}));
vi.mock("@/server/shopify", () => ({
  getShopifyGateway: () => ({
    searchCustomers: mocks.shopify,
    getCustomer: mocks.getCustomer,
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        or: (filter: string) => {
          mocks.orFilters.push(filter);
          return query;
        },
        order: () => query,
        limit: async () => ({
          data: table === "clients" ? mocks.clients : mocks.contacts,
          error: null,
        }),
        maybeSingle: async () => ({ data: mocks.existing, error: null }),
        insert: (row: object) => {
          mocks.inserted(row);
          return { select: () => ({ single: async () => mocks.insertResult }) };
        },
      };
      return query;
    },
  }),
}));

const { importShopifyCustomer, searchClients } =
  await import("./search-actions");

const clientRow = {
  id: "c1",
  kind: "persona",
  display_name: "Ana Pérez",
  document_type: "dni",
  document_number: "45678912",
  phone: "+51999888777",
  email: "ana@correo.pe",
  shopify_customer_id: "gid://shopify/Customer/1",
};

describe("searchClients", () => {
  beforeEach(() => {
    mocks.forbidden = false;
    mocks.orFilters = [];
    mocks.clients = [clientRow];
    mocks.contacts = [
      {
        id: "k1",
        client_id: "c2",
        display_name: "Luis Rojas",
        phone: null,
        email: null,
        shopify_customer_id: null,
        client: { display_name: "Andina S.A.C." },
      },
    ];
    mocks.shopify.mockReset().mockResolvedValue({
      items: [
        {
          id: "gid://shopify/Customer/1",
          displayName: "Ana (tienda)",
          email: null,
          phone: null,
        },
        {
          id: "gid://shopify/Customer/9",
          displayName: "Rosa Díaz",
          email: "rosa@x.pe",
          phone: null,
        },
      ],
      pageInfo: { hasNextPage: false, endCursor: null },
    });
  });

  it("une clientes, contactos y clientes de Shopify que no están en el sistema", async () => {
    const result = await searchClients("999 888");
    expect(result.shopifyUnavailable).toBe(false);
    expect(result.options.map((o) => [o.source, o.kind, o.name])).toEqual([
      ["local", "persona", "Ana Pérez"],
      ["local", "contacto", "Luis Rojas"],
      ["shopify", "persona", "Rosa Díaz"],
    ]);
    expect(result.options[1]).toMatchObject({ companyName: "Andina S.A.C." });
    expect(mocks.orFilters[0]).toContain("phone.ilike.%999888%");
  });

  it("si Shopify falla muestra solo los resultados del sistema", async () => {
    mocks.shopify.mockRejectedValue(new Error("caído"));
    const result = await searchClients("Ana");
    expect(result.shopifyUnavailable).toBe(true);
    expect(result.options).toHaveLength(2);
    expect(mocks.orFilters[0]).not.toContain("phone");
  });

  it("no busca con menos de 2 caracteres y exige permiso", async () => {
    expect(await searchClients("a")).toEqual({
      options: [],
      shopifyUnavailable: false,
    });
    expect(mocks.shopify).not.toHaveBeenCalled();
    mocks.forbidden = true;
    await expect(searchClients("Ana")).rejects.toThrow("FORBIDDEN");
  });
});

describe("importShopifyCustomer", () => {
  beforeEach(() => {
    mocks.forbidden = false;
    mocks.existing = null;
    mocks.inserted.mockReset();
    mocks.getCustomer.mockReset();
    mocks.insertResult = {
      data: { ...clientRow, id: "c9", display_name: "Rosa Díaz" },
      error: null,
    };
  });

  it("guarda el cliente de Shopify como persona ya sincronizada", async () => {
    mocks.getCustomer.mockResolvedValue({
      id: "gid://shopify/Customer/9",
      firstName: "Rosa",
      lastName: "Díaz",
      email: "Rosa@X.pe",
      phone: "+51977666555",
      note: "VIP",
    });
    const result = await importShopifyCustomer("gid://shopify/Customer/9");
    expect(mocks.inserted).toHaveBeenCalledWith({
      kind: "persona",
      first_name: "Rosa",
      last_name: "Díaz",
      phone: "+51977666555",
      email: "rosa@x.pe",
      notes: "VIP",
      shopify_customer_id: "gid://shopify/Customer/9",
    });
    expect(result).toMatchObject({
      ok: true,
      option: { clientId: "c9", source: "local" },
    });
  });

  it("sin nombre usa el email; descarta teléfonos que no son E.164", async () => {
    mocks.getCustomer.mockResolvedValue({
      id: "gid://shopify/Customer/9",
      firstName: "",
      lastName: "",
      email: "solo@correo.pe",
      phone: "999",
      note: "",
    });
    await importShopifyCustomer("gid://shopify/Customer/9");
    expect(mocks.inserted).toHaveBeenCalledWith(
      expect.objectContaining({
        first_name: "solo",
        last_name: "",
        phone: null,
      }),
    );
  });

  it("si ya se importó devuelve el existente sin llamar a Shopify", async () => {
    mocks.existing = clientRow;
    const result = await importShopifyCustomer("gid://shopify/Customer/1");
    expect(result).toMatchObject({ ok: true, option: { clientId: "c1" } });
    expect(mocks.getCustomer).not.toHaveBeenCalled();
  });

  it("informa ids inválidos, clientes inexistentes y errores al guardar", async () => {
    expect(await importShopifyCustomer("x")).toEqual({
      error: "Cliente de Shopify inválido.",
    });
    mocks.getCustomer.mockResolvedValue(null);
    expect(await importShopifyCustomer("gid://shopify/Customer/5")).toEqual({
      error: "El cliente ya no existe en Shopify.",
    });
    mocks.getCustomer.mockResolvedValue({
      id: "gid://shopify/Customer/5",
      firstName: "A",
      lastName: "",
      email: null,
      phone: null,
      note: "",
    });
    mocks.insertResult = { data: null, error: { code: "x" } };
    expect(await importShopifyCustomer("gid://shopify/Customer/5")).toEqual({
      error: "No se pudo guardar el cliente de Shopify.",
    });
  });
});
