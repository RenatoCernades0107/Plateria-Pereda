import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseQuoteFilters } from "@/domain/quote-filters";

const mocks = vi.hoisted(() => ({
  calls: [] as [string, ...unknown[]][],
  rows: [] as object[],
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => {
      const chain: Record<string, unknown> = {};
      for (const method of ["select", "or", "eq", "gte", "lt", "order"]) {
        chain[method] = (...args: unknown[]) => {
          mocks.calls.push([method, ...args]);
          return chain;
        };
      }
      chain.range = async (...args: unknown[]) => {
        mocks.calls.push(["range", ...args]);
        return { data: mocks.rows, count: 30, error: null };
      };
      return chain;
    },
  }),
}));

const { listQuotes } = await import("./queries");

const filterCalls = () =>
  mocks.calls.filter(([m]) => ["or", "eq", "gte", "lt"].includes(m));

beforeEach(() => {
  mocks.calls = [];
  mocks.rows = [];
  vi.useFakeTimers({ toFake: ["Date"] });
  // 4 de octubre de 2026, 22:00 en Lima.
  vi.setSystemTime(new Date("2026-10-05T03:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("listQuotes", () => {
  it("vencida = emitida con la vigencia antes de hoy en Lima", async () => {
    await listQuotes(parseQuoteFilters({ estado: "vencida" }));
    expect(filterCalls()).toEqual([
      ["eq", "status", "emitida"],
      ["lt", "valid_until", "2026-10-04"],
    ]);
  });

  it("emitida = aún vigente", async () => {
    await listQuotes(parseQuoteFilters({ estado: "emitida" }));
    expect(filterCalls()).toEqual([
      ["eq", "status", "emitida"],
      ["gte", "valid_until", "2026-10-04"],
    ]);
  });

  it("busca por código o cliente y filtra por cliente y fechas de Lima", async () => {
    const page = await listQuotes(
      parseQuoteFilters({
        q: "ana, (x)",
        estado: "aceptada",
        cliente: "33333333-3333-4333-8333-333333333333",
        desde: "2026-10-01",
        hasta: "2026-10-31",
        pagina: "2",
      }),
    );
    expect(filterCalls()).toEqual([
      ["or", "code.ilike.*ana x*,client_name.ilike.*ana x*"],
      ["eq", "status", "aceptada"],
      ["eq", "client_id", "33333333-3333-4333-8333-333333333333"],
      ["gte", "created_at", "2026-10-01T00:00:00-05:00"],
      ["lt", "created_at", "2026-11-01T00:00:00-05:00"],
    ]);
    expect(mocks.calls.at(-1)).toEqual(["range", 25, 49]);
    expect(page).toMatchObject({ total: 30, pages: 2 });
  });

  it("muestra como vencida una emitida cuya vigencia pasó", async () => {
    mocks.rows = [
      {
        id: "q1",
        code: "COT-000001",
        status: "emitida",
        client_name: "Ana",
        contact_name: null,
        issue_date: "2026-09-01",
        valid_until: "2026-09-16",
        total: 786,
        created_at: "2026-09-01T15:00:00Z",
      },
    ];
    const { quotes } = await listQuotes(parseQuoteFilters({}));
    expect(quotes[0]).toMatchObject({ status: "vencida", total: 78600 });
  });
});
