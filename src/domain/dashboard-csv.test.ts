import { describe, expect, it } from "vitest";

import {
  csvDocument,
  dashboardCsvFilename,
  sellersCsv,
  workshopsCsv,
} from "./dashboard-csv";
import type { DashboardSellers, DashboardWorkshops } from "./dashboard-schemas";

describe("csvDocument", () => {
  it("lleva BOM, título, periodo y secciones separadas por una línea en blanco", () => {
    const csv = csvDocument("Dashboard · Ventas", "1 oct – 5 oct 2026", [
      {
        title: "Por método",
        header: ["Método", "Cobrado (S/)"],
        rows: [
          ["Yape", 100.5],
          ["Plin", null],
        ],
      },
    ]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.split("\r\n")).toEqual([
      "﻿Dashboard · Ventas",
      "Periodo: 1 oct – 5 oct 2026",
      "",
      "Por método",
      "Método,Cobrado (S/)",
      "Yape,100.5",
      "Plin,",
      "",
    ]);
  });

  it("escapa comas, comillas y saltos de línea", () => {
    const csv = csvDocument("t", "p", [
      {
        title: "s",
        header: ["a"],
        rows: [['Cliente, "Uno"'], ["dos\nlíneas"]],
      },
    ]);
    expect(csv).toContain('"Cliente, ""Uno"""');
    expect(csv).toContain('"dos\nlíneas"');
  });
});

describe("workshopsCsv", () => {
  const base: DashboardWorkshops = {
    from: "2026-10-01",
    to: "2026-10-31",
    alert_days: 7,
    workshops: [
      {
        id: "1",
        name: "Taller Uno",
        active: true,
        returned: 2,
        avg_days: 4.5,
        median_days: 4.5,
        max_days: 6,
        sent: 3,
        observed: 0,
        in_workshop: 1,
        over_alert: 0,
        max_now_days: 3,
        cost: 40,
        avg_cost: 40,
      },
    ],
    total: {
      returned: 2,
      avg_days: 4.5,
      median_days: 4.5,
      in_workshop: 1,
      over_alert: 0,
      cost: 40,
      buckets: [],
    },
  };
  it("el admin recibe la columna de costo", () => {
    expect(workshopsCsv(base, "p")).toContain("Costo (S/)");
    expect(workshopsCsv(base, "p")).toContain(
      "Taller Uno,3,2,4.5,4.5,6,0,1,0,40",
    );
  });
  it("sin costo (ventas) no hay columna de costo", () => {
    const sinCosto: DashboardWorkshops = {
      ...base,
      workshops: [{ ...base.workshops[0]!, cost: null, avg_cost: null }],
      total: { ...base.total, cost: null },
    };
    expect(workshopsCsv(sinCosto, "p")).not.toContain("Costo");
  });
});

describe("sellersCsv y nombre de archivo", () => {
  it("el desempeño propio se titula distinto", () => {
    const data: DashboardSellers = {
      from: "a",
      to: "b",
      scope: "propio",
      sellers: [],
    };
    expect(sellersCsv(data, "p")).toContain("Dashboard · Mi desempeño");
    expect(sellersCsv({ ...data, scope: "todos" }, "p")).toContain(
      "Dashboard · Vendedores",
    );
  });
  it("el archivo lleva la pestaña y el rango", () => {
    expect(
      dashboardCsvFilename("ventas", { from: "2026-10-01", to: "2026-10-27" }),
    ).toBe("dashboard-ventas-2026-10-01_2026-10-27.csv");
  });
});
