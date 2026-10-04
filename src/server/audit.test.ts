import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  calls: [] as [string, ...unknown[]][],
  result: {
    data: [] as object[] | null,
    error: null as object | null,
    count: 0,
  },
}));

// Query builder encadenable que registra cada llamada y resuelve con `mocks.result`.
function builder() {
  const query: Record<string, unknown> = {};
  for (const method of [
    "select",
    "order",
    "range",
    "is",
    "eq",
    "gte",
    "lt",
    "limit",
  ]) {
    query[method] = (...args: unknown[]) => {
      mocks.calls.push([method, ...args]);
      return query;
    };
  }
  query.then = (resolve: (value: unknown) => void) => resolve(mocks.result);
  return query;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: () => builder() }),
}));

const { getEntityHistory, listAuditLog } = await import("./audit");

const row = {
  id: 1,
  occurred_at: "2026-10-03T15:00:00Z",
  actor_id: "u1",
  actor_name: "Ana",
  table_name: "profiles",
  record_id: "r1",
  action: "update",
  changes: { role: { old: "ventas", new: "admin" } },
};

describe("consultas de auditoría", () => {
  beforeEach(() => {
    mocks.calls = [];
    mocks.result = { data: [row], error: null, count: 60 };
  });

  it("aplica los filtros, la página y calcula el total de páginas", async () => {
    const result = await listAuditLog({
      actor: "u1",
      entity: "profiles",
      action: "update",
      from: "2026-10-01",
      to: "2026-10-03",
      page: 2,
    });
    expect(mocks.calls).toEqual(
      expect.arrayContaining([
        ["range", 25, 49],
        ["eq", "actor_id", "u1"],
        ["eq", "table_name", "profiles"],
        ["eq", "action", "update"],
        ["gte", "occurred_at", "2026-10-01T05:00:00.000Z"],
        ["lt", "occurred_at", "2026-10-04T05:00:00.000Z"],
      ]),
    );
    expect(result.total).toBe(60);
    expect(result.pages).toBe(3);
    expect(result.entries[0]).toEqual({
      id: 1,
      occurredAt: "2026-10-03T15:00:00Z",
      actorName: "Ana",
      table: "profiles",
      recordId: "r1",
      action: "update",
      changes: { role: { old: "ventas", new: "admin" } },
    });
  });

  it("el filtro sistema busca cambios sin usuario", async () => {
    await listAuditLog({ actor: "sistema", page: 1 });
    expect(mocks.calls).toContainEqual(["is", "actor_id", null]);
  });

  it("muestra el actor sin nombre como usuario eliminado y sin actor como sistema", async () => {
    mocks.result.data = [
      { ...row, actor_name: null },
      { ...row, id: 2, actor_id: null, actor_name: null },
    ];
    const { entries } = await listAuditLog({ page: 1 });
    expect(entries.map((e) => e.actorName)).toEqual([
      "Usuario eliminado",
      null,
    ]);
  });

  it("una página fuera de rango queda vacía; otros errores se propagan", async () => {
    mocks.result = { data: null, error: { code: "PGRST103" }, count: 0 };
    expect(await listAuditLog({ page: 99 })).toEqual({
      entries: [],
      total: 0,
      pages: 1,
    });
    mocks.result = { data: null, error: { code: "500" }, count: 0 };
    await expect(listAuditLog({ page: 1 })).rejects.toEqual({ code: "500" });
  });

  it("lee el historial de un registro", async () => {
    const entries = await getEntityHistory("profiles", "r1");
    expect(mocks.calls).toEqual(
      expect.arrayContaining([
        ["eq", "table_name", "profiles"],
        ["eq", "record_id", "r1"],
      ]),
    );
    expect(entries).toHaveLength(1);
    mocks.result = { data: null, error: { code: "x" }, count: 0 };
    await expect(getEntityHistory("profiles", "r1")).rejects.toEqual({
      code: "x",
    });
  });
});
