import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc: mocks.rpc }),
}));

const { dashboardCounts } = await import("./dashboard");

describe("dashboardCounts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockImplementation(
      async (fn: string, args: Record<string, unknown>) => {
        // 3 piezas urgentes; 2 restauraciones con pago pendiente; el resto, 0.
        if (fn === "list_pieces_board" && args.p_urgent)
          return { data: [{ total_count: 3 }], error: null };
        if (
          fn === "list_restorations" &&
          JSON.stringify(args.p_payment_status) === '["pendiente"]'
        )
          return { data: [{ total_count: 2 }], error: null };
        return { data: [], error: null };
      },
    );
  });

  it("cuenta cada filtro con una sola fila y enlaza al listado filtrado", async () => {
    const { pieces, restorations } = await dashboardCounts({
      showMoney: true,
    });
    expect(pieces.find((c) => c.key === "urgentes")).toMatchObject({
      count: 3,
      label: "Urgentes",
    });
    expect(pieces.find((c) => c.key === "urgentes")?.href).toMatch(
      /^\/piezas\?/,
    );
    expect(restorations.find((c) => c.key === "pago-pendiente")).toMatchObject({
      count: 2,
    });
    expect(restorations.find((c) => c.key === "listas")?.count).toBe(0);
    for (const [, args] of mocks.rpc.mock.calls) {
      expect(args.p_limit).toBe(1);
    }
  });

  it("sin montos no cuenta los filtros de pago", async () => {
    const { restorations } = await dashboardCounts({ showMoney: false });
    expect(restorations.some((c) => c.key.startsWith("pago"))).toBe(false);
  });
});
