import { describe, expect, it } from "vitest";

import {
  clientsCsv,
  csvDocument,
  dashboardCsvFilename,
  ordersCsv,
  quotesCsv,
  salesCsv,
  sellersCsv,
  summaryCsv,
  workshopsCsv,
} from "./dashboard-csv";
import type {
  DashboardClients,
  DashboardOrders,
  DashboardQuotes,
  DashboardSales,
  DashboardSellers,
  DashboardWorkshops,
} from "./dashboard-schemas";

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

describe("CSV de cada pestaña", () => {
  const summary = (sold: number, margin: number | null) => ({
    from: "2026-10-01",
    to: "2026-10-31",
    bucket: "dia",
    sold,
    sold_orders: 2,
    sold_pieces: 3,
    ticket: sold / 2,
    collected: 100,
    refunds: 10,
    balance_due: 40,
    orders: 3,
    delivered: 1,
    fulfillment_avg: 5,
    fulfillment_median: 5,
    new_clients: 1,
    cwa_created: 2,
    cwa_converted: 1,
    cwa_conversion: 50,
    margin,
    margin_pct: margin === null ? null : 40,
    series: [{ d: "2026-10-01", vendido: sold, cobrado: 100, guias: 3 }],
  });

  it("resumen: indicador, periodo, anterior y variación; margen solo si viene", () => {
    const csv = summaryCsv(summary(300, 120), summary(200, 80), "p");
    expect(csv).toContain("Vendido (S/),300,200,50");
    expect(csv).toContain("Margen estimado (S/),120,80,50");
    expect(csv).toContain("Saldo por cobrar hoy (S/),40,,");
    expect(csv).toContain("2026-10-01,300,100,3");
    expect(summaryCsv(summary(0, null), summary(0, null), "p")).not.toContain(
      "Margen",
    );
  });

  it("ventas: desgloses con etiquetas en español y margen del admin", () => {
    const data: DashboardSales = {
      from: "a",
      to: "b",
      bucket: "dia",
      sold: 300,
      collected: 100,
      collection_rate: 33.3,
      series: [{ d: "2026-10-01", vendido: 300, cobrado: 100 }],
      by_method: [{ label: "Yape", value: 100 }],
      by_origin: [{ key: "whatsapp", sold: 300, orders: 2, ticket: 150 }],
      by_payment_type: [{ key: "a_cuenta", value: 300 }],
      by_service: [{ label: "Pulido", value: 300 }],
      by_material: [{ label: "Plata", value: 300 }],
      margin: {
        margin: 100,
        base: 200,
        cost: 100,
        pieces: 2,
        pieces_without_cost: 1,
      },
    };
    const csv = salesCsv(data, "p");
    expect(csv).toContain("WhatsApp,300,2,150");
    expect(csv).toContain("A cuenta,300");
    expect(csv).toContain("Margen (S/),100");
    expect(salesCsv({ ...data, margin: null }, "p")).not.toContain("Margen");
  });

  it("pedidos: estados, tipos, embudo y ubicaciones", () => {
    const data: DashboardOrders = {
      from: "a",
      to: "b",
      bucket: "dia",
      orders: 2,
      pieces_per_order: 1.5,
      by_status: [{ key: "parcialmente_lista", value: 2 }],
      by_kind: [{ key: "interno", value: 1 }],
      by_location: [{ key: "en_taller", value: 4 }],
      funnel: {
        registered: 3,
        approved: 2,
        delivered: 1,
        in_consultation: 1,
        rejected: 0,
        no_fix: 0,
        cancelled: 0,
        urgent: 1,
      },
      fulfillment: {
        delivered: 1,
        avg: 5,
        median: 5,
        p90: 5,
        buckets: [{ label: "4–7 días", value: 1 }],
      },
      series: [{ d: "2026-10-01", guias: 2, entregadas: 1 }],
    };
    const csv = ordersCsv(data, "p");
    expect(csv).toContain("Parcialmente lista,2");
    expect(csv).toContain("Interna,1");
    expect(csv).toContain("En taller,4");
    expect(csv).toContain("Urgentes,1");
    expect(csv).toContain("4–7 días,1");
  });

  it("clientes: mejores, regiones con nombre y saldos", () => {
    const data: DashboardClients = {
      from: "a",
      to: "b",
      bucket: "dia",
      total_active: 10,
      new_clients: 2,
      active_in_range: 4,
      returning: 1,
      repeat_rate: 25,
      new_by_kind: [{ key: "persona", value: 2 }],
      top_clients: [
        {
          id: "1",
          name: "Ana",
          orders: 2,
          pieces: 3,
          sold: 200,
          last_at: "2026-10-02",
        },
      ],
      regions: [{ region: "CUS", orders: 1, clients: 1, sold: 200 }],
      top_debtors: [{ id: "1", name: "Ana", orders: 1, due: 50 }],
      series: [{ d: "2026-10-01", nuevos: 2 }],
    };
    const csv = clientsCsv(data, "p");
    expect(csv).toContain("Ana,2,3,200,2026-10-02");
    expect(csv).toContain("Cusco,1,1,200");
    expect(csv).toContain("Ana,1,50");
    expect(csv).toContain("Recompra (%),25");
  });

  it("cotizaciones: WhatsApp, motivos, cotizador y origen", () => {
    const data: DashboardQuotes = {
      from: "a",
      to: "b",
      bucket: "dia",
      cwa: {
        created: 3,
        cotizada: 1,
        pedida_parcial: 1,
        pedida: 0,
        descartada: 1,
        quoted_amount: 300,
        items_quoted: 4,
        items_ordered: 1,
        ordered_amount: 50,
        conversion: 33.3,
        item_conversion: 25,
      },
      discard_reasons: [{ label: "muy caro", value: 1 }],
      cot: {
        created: 2,
        borrador: 0,
        emitida: 1,
        aceptada: 1,
        rechazada: 0,
        vencida: 0,
        amount: 100,
        accepted_amount: 50,
        acceptance: 50,
      },
      by_origin: [{ key: "oficina", orders: 2, sold: 100, ticket: 50 }],
      series: [{ d: "2026-10-01", cotizadas: 3, pedidas: 1 }],
    };
    const csv = quotesCsv(data, "p");
    expect(csv).toContain("Conversión (%),33.3");
    expect(csv).toContain("muy caro,1");
    expect(csv).toContain("Aceptación (%),50");
    expect(csv).toContain("Oficina,2,100,50");
  });
});
