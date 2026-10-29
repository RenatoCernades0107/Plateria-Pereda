import { describe, expect, it } from "vitest";

import { summaryInsights } from "./dashboard-insights";
import type { DashboardSummary } from "./dashboard-schemas";

const base: DashboardSummary = {
  from: "2026-10-01",
  to: "2026-10-03",
  bucket: "dia",
  sold: 0,
  sold_orders: 0,
  sold_pieces: 0,
  ticket: 0,
  collected: 0,
  refunds: 0,
  balance_due: 0,
  orders: 0,
  delivered: 0,
  fulfillment_avg: null,
  fulfillment_median: null,
  new_clients: 0,
  cwa_created: 0,
  cwa_converted: 0,
  cwa_conversion: null,
  margin: null,
  margin_pct: null,
  series: [],
};

describe("summaryInsights", () => {
  it("sin actividad no dice nada", () => {
    expect(summaryInsights(base, base, "dia")).toEqual([]);
  });

  it("compara con el periodo anterior y destaca el mejor día", () => {
    const current: DashboardSummary = {
      ...base,
      sold: 1500,
      collected: 750,
      balance_due: 300,
      series: [
        { d: "2026-10-01", vendido: 200, cobrado: 0, guias: 1 },
        { d: "2026-10-02", vendido: 1000, cobrado: 750, guias: 2 },
        { d: "2026-10-03", vendido: 300, cobrado: 0, guias: 0 },
      ],
    };
    const texts = summaryInsights(current, { ...base, sold: 1000 }, "dia").map(
      (i) => i.text,
    );
    expect(texts[0]).toBe("Vendiste 50 % más que en el periodo anterior.");
    expect(texts[1]).toBe("Tu mejor día fue el 2 oct con S/ 1,000.");
    expect(texts[2]).toBe(
      "Cobraste el 50 % de lo que vendiste en el periodo; hoy hay S/ 300 por cobrar en total.",
    );
  });

  it("una baja se dice en positivo y sin signo", () => {
    const texts = summaryInsights(
      { ...base, sold: 500 },
      { ...base, sold: 1000 },
      "dia",
    );
    expect(texts[0]?.text).toBe(
      "Vendiste 50 % menos que en el periodo anterior.",
    );
  });

  it("si antes no hubo ventas, no inventa un porcentaje", () => {
    const texts = summaryInsights({ ...base, sold: 500 }, base, "dia");
    expect(texts[0]?.text).toContain("Volvieron las ventas");
  });

  it("cumplimiento y WhatsApp aparecen cuando hay datos", () => {
    const texts = summaryInsights(
      {
        ...base,
        delivered: 3,
        fulfillment_avg: 1,
        cwa_created: 4,
        cwa_converted: 1,
      },
      base,
      "dia",
    ).map((i) => i.text);
    expect(texts).toContain(
      "Una pieza tarda en promedio 1 día desde que se registra hasta que se entrega.",
    );
    expect(texts).toContain(
      "1 de 4 cotizaciones de WhatsApp terminaron en pedido.",
    );
  });

  it("por semana y por mes usa el género correcto", () => {
    const series = [
      { d: "2026-10-05", vendido: 900, cobrado: 0, guias: 1 },
      { d: "2026-10-12", vendido: 100, cobrado: 0, guias: 1 },
    ];
    expect(
      summaryInsights({ ...base, sold: 1000, series }, base, "semana").find(
        (i) => i.key === "mejor",
      )?.text,
    ).toBe("Tu mejor semana fue la del 5 oct con S/ 900.");
    expect(
      summaryInsights(
        {
          ...base,
          sold: 1000,
          series: [
            { d: "2026-09-01", vendido: 900, cobrado: 0, guias: 1 },
            { d: "2026-10-01", vendido: 100, cobrado: 0, guias: 1 },
          ],
        },
        base,
        "mes",
      ).find((i) => i.key === "mejor")?.text,
    ).toBe("Tu mejor mes fue setiembre 2026 con S/ 900.");
  });
});
