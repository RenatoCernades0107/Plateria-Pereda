import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DashboardRange } from "@/domain/dashboard-range";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc: mocks.rpc }),
}));

const {
  dashboardSales,
  dashboardSellers,
  dashboardSummary,
  dashboardSummaryWithPrevious,
  dashboardWorkshops,
} = await import("./dashboard-metrics");

const RANGE: DashboardRange = {
  from: "2026-09-28",
  to: "2026-10-27",
  preset: "30d",
};

const summary = (sold: number) => ({
  from: "2026-09-28",
  to: "2026-10-27",
  bucket: "dia",
  sold,
  sold_orders: 2,
  sold_pieces: 4,
  ticket: sold / 2,
  collected: 100,
  refunds: 0,
  balance_due: 50,
  orders: 3,
  delivered: 1,
  fulfillment_avg: null,
  fulfillment_median: null,
  new_clients: 1,
  cwa_created: 0,
  cwa_converted: 0,
  cwa_conversion: null,
  margin: null,
  margin_pct: null,
  series: [{ d: "2026-10-27", vendido: sold, cobrado: 100, guias: 3 }],
});

describe("dashboard-metrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("llama a la función con el rango y la agrupación", async () => {
    mocks.rpc.mockResolvedValue({ data: summary(300), error: null });
    const result = await dashboardSummary(RANGE);
    expect(mocks.rpc).toHaveBeenCalledWith("dashboard_summary", {
      p_from: "2026-09-28",
      p_to: "2026-10-27",
      p_bucket: "dia",
    });
    expect(result.sold).toBe(300);
  });

  it("el resumen con periodo anterior pide los dos rangos con la misma agrupación", async () => {
    mocks.rpc.mockImplementation(async (_fn: string, args: { p_from: string }) => ({
      data: summary(args.p_from === "2026-09-28" ? 300 : 200),
      error: null,
    }));
    const { current, previous } = await dashboardSummaryWithPrevious(RANGE);
    expect(current.sold).toBe(300);
    expect(previous.sold).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("dashboard_summary", {
      p_from: "2026-08-29",
      p_to: "2026-09-27",
      p_bucket: "dia",
    });
  });

  it("un rango largo agrupa por semana", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        from: "2026-01-01", to: "2026-06-30", bucket: "semana", sold: 0, collected: 0,
        collection_rate: null, series: [], by_method: [], by_origin: [],
        by_payment_type: [], by_service: [], by_material: [], margin: null,
      },
      error: null,
    });
    await dashboardSales({ from: "2026-01-01", to: "2026-06-30", preset: "custom" });
    expect(mocks.rpc).toHaveBeenCalledWith("dashboard_sales", {
      p_from: "2026-01-01",
      p_to: "2026-06-30",
      p_bucket: "semana",
    });
  });

  it("talleres usa el umbral de alerta de días", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        from: "2026-09-28", to: "2026-10-27", alert_days: 7, workshops: [],
        total: { returned: 0, avg_days: null, median_days: null, in_workshop: 0, over_alert: 0, cost: null, buckets: [] },
      },
      error: null,
    });
    await dashboardWorkshops(RANGE);
    expect(mocks.rpc).toHaveBeenCalledWith("dashboard_workshops", {
      p_from: "2026-09-28",
      p_to: "2026-10-27",
      p_alert_days: 7,
    });
  });

  it("vendedores no manda agrupación", async () => {
    mocks.rpc.mockResolvedValue({
      data: { from: "2026-09-28", to: "2026-10-27", scope: "propio", sellers: [] },
      error: null,
    });
    await dashboardSellers(RANGE);
    expect(mocks.rpc).toHaveBeenCalledWith("dashboard_sellers", {
      p_from: "2026-09-28",
      p_to: "2026-10-27",
    });
  });

  it("propaga el error de la base de datos", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "sin permiso", code: "42501" } });
    await expect(dashboardSummary(RANGE)).rejects.toMatchObject({ code: "42501" });
  });

  it("rechaza una respuesta con otra forma", async () => {
    mocks.rpc.mockResolvedValue({ data: { sold: "mucho" }, error: null });
    await expect(dashboardSummary(RANGE)).rejects.toThrow();
  });
});
