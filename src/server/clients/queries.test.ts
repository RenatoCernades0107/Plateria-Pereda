import { describe, expect, it, vi } from "vitest";

import { parseClientFilters } from "@/domain/client-filters";

const mocks = vi.hoisted(() => ({
  detail: null as object | null,
  rpcResults: {} as Record<string, object[]>,
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: mocks.detail, error: null }),
        }),
      }),
    }),
    rpc: async (name: string, args: { p_entity_table?: string }) => {
      mocks.rpc(name, args);
      const key = args.p_entity_table ? `${name}:${args.p_entity_table}` : name;
      return { data: mocks.rpcResults[key] ?? [], error: null };
    },
  }),
}));

const { getClientDetail, getSyncStates, listClients } =
  await import("./queries");

const row = {
  id: "c1",
  kind: "persona",
  display_name: "Ana Pérez",
  document_type: "dni",
  document_number: "45678912",
  phone: "+51999888777",
  email: null,
  active: true,
  job_id: 5,
  sync_status: "error",
  last_error: "falló",
  total_count: 30,
};

describe("listClients", () => {
  it("pasa los filtros a la BD y arma la paginación", async () => {
    mocks.rpcResults = {
      list_clients: [
        row,
        { ...row, id: "c2", job_id: null, sync_status: null, last_error: null },
      ],
    };
    const page = await listClients(
      parseClientFilters({
        q: "ana",
        tipo: "persona",
        sync: "error",
        pagina: "2",
      }),
    );
    expect(mocks.rpc).toHaveBeenCalledWith("list_clients", {
      p_query: "ana",
      p_kind: "persona",
      p_sync: "error",
      p_active: true,
      p_limit: 25,
      p_offset: 25,
    });
    expect(page.total).toBe(30);
    expect(page.pages).toBe(2);
    expect(page.clients[0]).toMatchObject({
      displayName: "Ana Pérez",
      sync: { jobId: 5, status: "error", lastError: "falló" },
    });
    expect(page.clients[1]?.sync).toBeNull();
  });

  it("sin resultados devuelve una página vacía; 'todos' no filtra por estado", async () => {
    mocks.rpcResults = {};
    mocks.rpc.mockClear();
    const page = await listClients(parseClientFilters({ estado: "todos" }));
    expect(page).toEqual({ clients: [], total: 0, pages: 1 });
    expect(mocks.rpc).toHaveBeenCalledWith(
      "list_clients",
      expect.objectContaining({ p_query: undefined, p_active: undefined }),
    );
  });
});

describe("getClientDetail", () => {
  const contact = (
    id: string,
    name: string,
    active: boolean,
    gid: string | null,
  ) => ({
    id,
    first_name: name,
    last_name: "",
    display_name: name,
    position: "",
    document_type: null,
    document_number: null,
    phone: null,
    email: null,
    active,
    shopify_customer_id: gid,
  });

  it("une la empresa, sus contactos ordenados y sus estados", async () => {
    mocks.detail = {
      id: "c2",
      kind: "empresa",
      display_name: "Andina S.A.C.",
      first_name: "",
      last_name: "",
      legal_name: "Andina S.A.C.",
      document_type: "ruc",
      document_number: "20100047218",
      phone: null,
      email: null,
      address: "",
      city: "Lima",
      region: "LIM",
      notes: "",
      active: true,
      created_at: "2026-10-04T10:00:00Z",
      shopify_customer_id: null,
      shopify_company_id: "gid://shopify/Company/1",
      contacts: [
        contact("k3", "Zoila", false, null),
        contact("k2", "Rosa", true, "gid://shopify/Customer/2"),
        contact("k1", "Luis", true, null),
      ],
    };
    mocks.rpcResults = {
      "shopify_sync_status:contacts": [
        { entity_id: "k1", job_id: 9, status: "pending", last_error: null },
      ],
    };
    const detail = await getClientDetail("c2");
    expect(detail).toMatchObject({
      legalName: "Andina S.A.C.",
      // Importada o sincronizada sin jobs visibles: cuenta como sincronizada.
      sync: { jobId: null, status: "ok" },
    });
    expect(
      detail?.contacts.map((k) => [k.displayName, k.sync?.status]),
    ).toEqual([
      ["Luis", "pending"],
      ["Rosa", "ok"],
      ["Zoila", undefined],
    ]);
  });

  it("devuelve null si no existe", async () => {
    mocks.detail = null;
    expect(await getClientDetail("nada")).toBeNull();
  });
});

describe("getSyncStates", () => {
  it("sin registros no consulta estados", async () => {
    mocks.rpc.mockClear();
    expect(await getSyncStates("clients", [])).toEqual(new Map());
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
