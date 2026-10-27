import { describe, expect, it } from "vitest";

import {
  approvalRate,
  barWidth,
  bucketLabel,
  funnelLosses,
  funnelSteps,
  orderedCounts,
  regionName,
  seriesPoints,
  sparkValues,
  topWithOthers,
  withShare,
  workshopTone,
} from "./dashboard-charts";

describe("bucketLabel", () => {
  it("día y semana: «27 oct»", () => {
    expect(bucketLabel("2026-10-27", "dia")).toBe("27 oct");
    expect(bucketLabel("2026-10-26", "semana")).toBe("26 oct");
    expect(bucketLabel("2026-10-26", "semana", true)).toBe("Semana del 26 oct");
  });
  it("mes: «oct» y «octubre 2026»", () => {
    expect(bucketLabel("2026-10-01", "mes")).toBe("oct");
    expect(bucketLabel("2026-10-01", "mes", true)).toBe("octubre 2026");
  });
});

describe("series", () => {
  const series = [
    { d: "2026-10-01", vendido: 100 },
    { d: "2026-10-02", vendido: 250 },
  ];
  it("agrega las etiquetas sin perder los datos", () => {
    expect(seriesPoints(series, "dia")[1]).toEqual({
      d: "2026-10-02",
      vendido: 250,
      label: "2 oct",
      longLabel: "2 oct",
    });
  });
  it("sparkValues extrae una columna", () => {
    expect(sparkValues(series, "vendido")).toEqual([100, 250]);
  });
});

describe("topWithOthers", () => {
  const items = [
    { label: "a", value: 5 },
    { label: "b", value: 50 },
    { label: "c", value: 20 },
    { label: "d", value: 10 },
  ];
  it("ordena de mayor a menor", () => {
    expect(topWithOthers(items, 8).map((i) => i.label)).toEqual(["b", "c", "d", "a"]);
  });
  it("agrupa la cola en «Otros» sin pasar del máximo", () => {
    const top = topWithOthers(items, 3);
    expect(top).toHaveLength(3);
    expect(top[2]).toEqual({ label: "Otros", value: 15 });
  });
});

describe("withShare", () => {
  it("calcula el porcentaje sobre el total", () => {
    expect(withShare([{ value: 1 }, { value: 3 }]).map((i) => i.pct)).toEqual([25, 75]);
  });
  it("total cero: 0 %", () => {
    expect(withShare([{ value: 0 }])[0]?.pct).toBe(0);
  });
});

describe("orderedCounts", () => {
  it("sigue el orden canónico, etiqueta y quita ceros", () => {
    const result = orderedCounts(
      [
        { key: "aprobada", value: 3 },
        { key: "registrada", value: 1 },
        { key: "lista", value: 0 },
        { key: "rara", value: 2 },
      ],
      ["registrada", "aprobada", "lista"],
      { registrada: "Registrada", aprobada: "Aprobada" },
    );
    expect(result).toEqual([
      { key: "registrada", label: "Registrada", value: 1 },
      { key: "aprobada", label: "Aprobada", value: 3 },
      { key: "rara", label: "rara", value: 2 },
    ]);
  });
});

describe("embudo", () => {
  const funnel = {
    registered: 8, approved: 6, delivered: 2, in_consultation: 1,
    rejected: 1, no_fix: 0, cancelled: 1, urgent: 3,
  };
  it("pasos con porcentaje sobre lo registrado", () => {
    expect(funnelSteps(funnel).map((s) => [s.key, s.value, s.pct])).toEqual([
      ["registered", 8, 100],
      ["approved", 6, 75],
      ["delivered", 2, 25],
    ]);
  });
  it("sin piezas no hay porcentajes", () => {
    expect(funnelSteps({ ...funnel, registered: 0, approved: 0, delivered: 0 })[1]?.pct).toBeNull();
    expect(approvalRate({ ...funnel, registered: 0 })).toBeNull();
  });
  it("tasa de aprobación y pérdidas", () => {
    expect(approvalRate(funnel)).toBe(75);
    expect(funnelLosses(funnel).map((l) => l.value)).toEqual([1, 1, 0, 1]);
  });
});

describe("regionName", () => {
  it("traduce el código y maneja lo desconocido", () => {
    expect(regionName("LIM")).toBe("Lima");
    expect(regionName("ARE")).toBe("Arequipa");
    expect(regionName("SIN")).toBe("Sin región");
    expect(regionName("XYZ")).toBe("XYZ");
  });
});

describe("workshopTone", () => {
  const row = (in_workshop: number, over_alert: number, max_now_days: number | null) => ({
    in_workshop, over_alert, max_now_days,
  });
  it("sin piezas: neutro", () => expect(workshopTone(row(0, 0, null), 7)).toBe("neutral"));
  it("a tiempo: éxito", () => expect(workshopTone(row(2, 0, 3), 7)).toBe("success"));
  it("desde el umbral: atención", () => expect(workshopTone(row(2, 1, 7), 7)).toBe("attention"));
  it("el doble del umbral: crítico", () => expect(workshopTone(row(2, 2, 14), 7)).toBe("critical"));
});

describe("barWidth", () => {
  it("proporcional, con un mínimo visible", () => {
    expect(barWidth(50, 100)).toBe(50);
    expect(barWidth(0.1, 100)).toBe(2);
    expect(barWidth(0, 100)).toBe(0);
    expect(barWidth(5, 0)).toBe(0);
  });
});
