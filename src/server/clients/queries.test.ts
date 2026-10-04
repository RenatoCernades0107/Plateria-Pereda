import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rows: [] as object[],
  statuses: [] as object[],
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({
      select: () => ({
        order: () => ({
          limit: async () => ({ data: mocks.rows, error: null }),
        }),
      }),
    }),
    rpc: async (...args: unknown[]) => {
      mocks.rpc(...args);
      return { data: mocks.statuses, error: null };
    },
  }),
}));

const { getSyncStates, listRecentClients } = await import("./queries");

describe("consultas de clientes", () => {
  it("une los clientes con su estado de sincronización", async () => {
    mocks.rows = [
      {
        id: "c1",
        kind: "persona",
        display_name: "Ana Pérez",
        document_type: "dni",
        document_number: "45678912",
        phone: "+51999888777",
        email: null,
        active: true,
      },
      {
        id: "c2",
        kind: "empresa",
        display_name: "Andina",
        document_type: "ruc",
        document_number: "20100047218",
        phone: null,
        email: null,
        active: true,
      },
    ];
    mocks.statuses = [
      { entity_id: "c1", job_id: 5, status: "error", last_error: "falló" },
    ];
    const clients = await listRecentClients();
    expect(clients[0]).toMatchObject({
      displayName: "Ana Pérez",
      sync: { jobId: 5, status: "error", lastError: "falló" },
    });
    expect(clients[1]?.sync).toBeNull();
    expect(mocks.rpc).toHaveBeenCalledWith("shopify_sync_status", {
      p_entity_table: "clients",
      p_entity_ids: ["c1", "c2"],
    });
  });

  it("sin registros no consulta estados", async () => {
    mocks.rpc.mockClear();
    expect(await getSyncStates("clients", [])).toEqual(new Map());
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
