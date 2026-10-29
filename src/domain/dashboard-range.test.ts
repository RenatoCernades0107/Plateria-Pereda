import { describe, expect, it } from "vitest";

import {
  bucketFor,
  dashboardHref,
  dayDiff,
  formatRange,
  isIsoDate,
  parseDashboardParams,
  presetRange,
  previousRange,
  rangeDays,
  utcDate,
} from "./dashboard-range";

const TODAY = "2026-10-27";

describe("presetRange", () => {
  it.each([
    ["hoy", "2026-10-27", "2026-10-27"],
    ["7d", "2026-10-21", "2026-10-27"],
    ["30d", "2026-09-28", "2026-10-27"],
    ["90d", "2026-07-30", "2026-10-27"],
    ["mes", "2026-10-01", "2026-10-27"],
    ["mes-pasado", "2026-09-01", "2026-09-30"],
    ["anio", "2026-01-01", "2026-10-27"],
  ] as const)("%s", (preset, from, to) => {
    expect(presetRange(preset, TODAY)).toEqual({ from, to, preset });
  });

  it("el mes pasado respeta febrero (año bisiesto y no bisiesto)", () => {
    expect(presetRange("mes-pasado", "2028-03-10")).toMatchObject({
      from: "2028-02-01",
      to: "2028-02-29",
    });
    expect(presetRange("mes-pasado", "2027-03-10")).toMatchObject({
      from: "2027-02-01",
      to: "2027-02-28",
    });
  });

  it("el mes pasado desde enero cruza al año anterior", () => {
    expect(presetRange("mes-pasado", "2027-01-15")).toMatchObject({
      from: "2026-12-01",
      to: "2026-12-31",
    });
  });
});

describe("parseDashboardParams", () => {
  it("sin parámetros: resumen y 30 días", () => {
    expect(parseDashboardParams({}, TODAY)).toEqual({
      area: "resumen",
      range: { from: "2026-09-28", to: "2026-10-27", preset: "30d" },
    });
  });

  it("lee la pestaña y un atajo", () => {
    const { area, range } = parseDashboardParams(
      { area: "talleres", rango: "mes" },
      TODAY,
    );
    expect(area).toBe("talleres");
    expect(range).toEqual({
      from: "2026-10-01",
      to: "2026-10-27",
      preset: "mes",
    });
  });

  it("ignora una pestaña o atajo desconocidos", () => {
    const { area, range } = parseDashboardParams(
      { area: "secreto", rango: "ayer" },
      TODAY,
    );
    expect(area).toBe("resumen");
    expect(range.preset).toBe("30d");
  });

  it("acepta un rango personalizado y lo ordena si viene invertido", () => {
    expect(
      parseDashboardParams(
        { rango: "custom", desde: "2026-10-10", hasta: "2026-10-01" },
        TODAY,
      ).range,
    ).toEqual({ from: "2026-10-01", to: "2026-10-10", preset: "custom" });
  });

  it("con desde y hasta sin 'rango' también es personalizado", () => {
    expect(
      parseDashboardParams({ desde: "2026-10-01", hasta: "2026-10-05" }, TODAY)
        .range.preset,
    ).toBe("custom");
  });

  it("fechas inválidas vuelven al atajo por defecto", () => {
    const { range } = parseDashboardParams(
      { rango: "custom", desde: "2026-02-31", hasta: "mañana" },
      TODAY,
    );
    expect(range.preset).toBe("30d");
  });

  it("recorta un rango de más de 366 días a los últimos 366", () => {
    const { range } = parseDashboardParams(
      { rango: "custom", desde: "2020-01-01", hasta: "2026-10-27" },
      TODAY,
    );
    expect(range.to).toBe("2026-10-27");
    expect(rangeDays(range)).toBe(366);
  });

  it("toma el primer valor si el parámetro se repite", () => {
    expect(
      parseDashboardParams({ area: ["ventas", "pedidos"] }, TODAY).area,
    ).toBe("ventas");
  });
});

describe("previousRange", () => {
  it("es el periodo inmediatamente anterior y de la misma duración", () => {
    expect(
      previousRange({ from: "2026-09-28", to: "2026-10-27", preset: "30d" }),
    ).toEqual({ from: "2026-08-29", to: "2026-09-27", preset: "custom" });
  });

  it("un solo día compara contra el día anterior", () => {
    expect(
      previousRange({ from: "2026-10-27", to: "2026-10-27", preset: "hoy" }),
    ).toMatchObject({ from: "2026-10-26", to: "2026-10-26" });
  });

  it("cruza el cambio de año", () => {
    expect(
      previousRange({ from: "2027-01-01", to: "2027-01-10", preset: "custom" }),
    ).toMatchObject({ from: "2026-12-22", to: "2026-12-31" });
  });
});

describe("bucketFor", () => {
  it.each([
    [1, "dia"],
    [62, "dia"],
    [63, "semana"],
    [200, "semana"],
    [201, "mes"],
    [366, "mes"],
  ] as const)("%i días → %s", (days, bucket) => {
    expect(
      bucketFor({ from: "2026-01-01", to: addDaysTo("2026-01-01", days - 1) }),
    ).toBe(bucket);
  });
});

function addDaysTo(date: string, days: number): string {
  const base = utcDate(date);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

describe("dashboardHref", () => {
  const thirty = presetRange("30d", TODAY);
  it("lo que es por defecto no ensucia la URL", () => {
    expect(dashboardHref({})).toBe("/dashboard");
    expect(dashboardHref({ area: "resumen", range: thirty })).toBe(
      "/dashboard",
    );
  });
  it("incluye pestaña y atajo", () => {
    expect(
      dashboardHref({ area: "ventas", range: presetRange("mes", TODAY) }),
    ).toBe("/dashboard?area=ventas&rango=mes");
  });
  it("un rango personalizado lleva las fechas", () => {
    expect(
      dashboardHref({
        area: "clientes",
        range: { from: "2026-10-01", to: "2026-10-05", preset: "custom" },
      }),
    ).toBe(
      "/dashboard?area=clientes&rango=custom&desde=2026-10-01&hasta=2026-10-05",
    );
  });
});

describe("fechas", () => {
  it("isIsoDate valida días reales", () => {
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(isIsoDate("2027-02-29")).toBe(false);
    expect(isIsoDate("2026-1-1")).toBe(false);
  });
  it("dayDiff y rangeDays cuentan ambos extremos", () => {
    expect(dayDiff("2026-10-01", "2026-10-27")).toBe(26);
    expect(rangeDays({ from: "2026-10-01", to: "2026-10-27" })).toBe(27);
  });
  it("formatRange abrevia el mes y muestra el año una sola vez", () => {
    expect(formatRange({ from: "2026-10-01", to: "2026-10-27" })).toBe(
      "1 oct – 27 oct 2026",
    );
    expect(formatRange({ from: "2026-10-27", to: "2026-10-27" })).toBe(
      "27 oct 2026",
    );
    expect(formatRange({ from: "2025-12-20", to: "2026-01-10" })).toBe(
      "20 dic 2025 – 10 ene 2026",
    );
  });
});
