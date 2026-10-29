import { regionName } from "./dashboard-charts";
import { computeDelta } from "./dashboard-format";
import { DASHBOARD_AREA_LABELS, type DashboardArea } from "./dashboard-range";
import type {
  DashboardClients,
  DashboardOrders,
  DashboardQuotes,
  DashboardSales,
  DashboardSellers,
  DashboardSummary,
  DashboardWorkshops,
} from "./dashboard-schemas";
import { PAYMENT_TYPE_LABELS } from "./money";
import {
  PIECE_LOCATION_LABELS,
  RESTORATION_KIND_LABELS,
  RESTORATION_ORIGIN_LABELS,
  RESTORATION_STATUS_LABELS,
} from "./restoration-status";
import { csvField } from "./restorations-csv";

/**
 * CSV de cada pestaña del dashboard (con el mismo rango que se ve en pantalla). Con BOM
 * para que Excel lea las tildes y los montos en soles con punto decimal. Cada pestaña son
 * varias tablas pequeñas, separadas por una línea en blanco y con su título.
 */

type Cell = string | number | null;
export type CsvSection = { title: string; header: string[]; rows: Cell[][] };

/** Arma el archivo: título, cabecera y filas de cada sección. */
export function csvDocument(
  heading: string,
  period: string,
  sections: CsvSection[],
): string {
  const lines: string[] = [csvLine([heading]), csvLine([`Periodo: ${period}`])];
  for (const section of sections) {
    lines.push("", csvLine([section.title]), csvLine(section.header));
    for (const row of section.rows) lines.push(csvLine(row));
  }
  return `﻿${lines.join("\r\n")}\r\n`;
}

function csvLine(cells: Cell[]): string {
  return cells.map((cell) => csvField(cell)).join(",");
}

const variation = (current: number | null, previous: number | null): Cell => {
  const delta = computeDelta(current, previous);
  return delta.pct === null ? "" : Number(delta.pct.toFixed(1));
};

const label = (map: Record<string, string>, key: string): string =>
  map[key] ?? key;

export function summaryCsv(
  current: DashboardSummary,
  previous: DashboardSummary,
  period: string,
): string {
  const kpi = (name: string, a: number | null, b: number | null): Cell[] => [
    name,
    a,
    b,
    variation(a, b),
  ];
  return csvDocument("Dashboard · Resumen", period, [
    {
      title: "Indicadores",
      header: ["Indicador", "Periodo", "Periodo anterior", "Variación %"],
      rows: [
        kpi("Vendido (S/)", current.sold, previous.sold),
        kpi("Cobrado (S/)", current.collected, previous.collected),
        kpi("Reembolsos (S/)", current.refunds, previous.refunds),
        kpi("Ticket promedio (S/)", current.ticket, previous.ticket),
        kpi("Guías con ventas", current.sold_orders, previous.sold_orders),
        kpi("Piezas vendidas", current.sold_pieces, previous.sold_pieces),
        kpi("Guías registradas", current.orders, previous.orders),
        kpi("Piezas entregadas", current.delivered, previous.delivered),
        kpi(
          "Cumplimiento promedio (días)",
          current.fulfillment_avg,
          previous.fulfillment_avg,
        ),
        kpi("Clientes nuevos", current.new_clients, previous.new_clients),
        kpi(
          "Cotizaciones de WhatsApp",
          current.cwa_created,
          previous.cwa_created,
        ),
        kpi(
          "Conversión de WhatsApp (%)",
          current.cwa_conversion,
          previous.cwa_conversion,
        ),
        ...(current.margin !== null
          ? [kpi("Margen estimado (S/)", current.margin, previous.margin)]
          : []),
        ["Saldo por cobrar hoy (S/)", current.balance_due, "", ""],
      ],
    },
    {
      title: "Serie",
      header: ["Desde", "Vendido (S/)", "Cobrado (S/)", "Guías registradas"],
      rows: current.series.map((p) => [p.d, p.vendido, p.cobrado, p.guias]),
    },
  ]);
}

export function salesCsv(data: DashboardSales, period: string): string {
  const pairs = (items: { label: string; value: number }[]): Cell[][] =>
    items.map((i) => [i.label, i.value]);
  return csvDocument("Dashboard · Ventas", period, [
    {
      title: "Resumen",
      header: ["Indicador", "Valor"],
      rows: [
        ["Vendido (S/)", data.sold],
        ["Cobrado (S/)", data.collected],
        ["Cobrado sobre vendido (%)", data.collection_rate],
        ...(data.margin
          ? ([
              ["Margen (S/)", data.margin.margin],
              ["Costo de servicio (S/)", data.margin.cost],
              ["Piezas sin costo", data.margin.pieces_without_cost],
            ] as Cell[][])
          : []),
      ],
    },
    {
      title: "Serie",
      header: ["Desde", "Vendido (S/)", "Cobrado (S/)"],
      rows: data.series.map((p) => [p.d, p.vendido, p.cobrado]),
    },
    {
      title: "Cobrado por método",
      header: ["Método", "Cobrado (S/)"],
      rows: pairs(data.by_method),
    },
    {
      title: "Vendido por origen",
      header: ["Origen", "Vendido (S/)", "Guías", "Ticket (S/)"],
      rows: data.by_origin.map((o) => [
        label(RESTORATION_ORIGIN_LABELS, o.key),
        o.sold,
        o.orders,
        o.ticket,
      ]),
    },
    {
      title: "Vendido por tipo de pago",
      header: ["Tipo de pago", "Vendido (S/)"],
      rows: data.by_payment_type.map((p) => [
        label(PAYMENT_TYPE_LABELS, p.key),
        p.value,
      ]),
    },
    {
      title: "Vendido por servicio",
      header: ["Servicio", "Vendido (S/)"],
      rows: pairs(data.by_service),
    },
    {
      title: "Vendido por material",
      header: ["Material", "Vendido (S/)"],
      rows: pairs(data.by_material),
    },
  ]);
}

export function ordersCsv(data: DashboardOrders, period: string): string {
  return csvDocument("Dashboard · Pedidos", period, [
    {
      title: "Resumen",
      header: ["Indicador", "Valor"],
      rows: [
        ["Guías registradas", data.orders],
        ["Piezas por guía", data.pieces_per_order],
        ["Piezas entregadas", data.fulfillment.delivered],
        ["Cumplimiento promedio (días)", data.fulfillment.avg],
        ["Cumplimiento mediana (días)", data.fulfillment.median],
        ["Cumplimiento 90 % (días)", data.fulfillment.p90],
      ],
    },
    {
      title: "Serie",
      header: ["Desde", "Guías registradas", "Piezas entregadas"],
      rows: data.series.map((p) => [p.d, p.guias, p.entregadas]),
    },
    {
      title: "Guías por estado",
      header: ["Estado", "Guías"],
      rows: data.by_status.map((s) => [
        label(RESTORATION_STATUS_LABELS, s.key),
        s.value,
      ]),
    },
    {
      title: "Guías por tipo",
      header: ["Tipo", "Guías"],
      rows: data.by_kind.map((k) => [
        label(RESTORATION_KIND_LABELS, k.key),
        k.value,
      ]),
    },
    {
      title: "Camino de las piezas registradas",
      header: ["Paso", "Piezas"],
      rows: [
        ["Registradas", data.funnel.registered],
        ["Aprobadas", data.funnel.approved],
        ["Entregadas", data.funnel.delivered],
        ["En consulta o espera", data.funnel.in_consultation],
        ["Rechazadas", data.funnel.rejected],
        ["Sin arreglo", data.funnel.no_fix],
        ["Anuladas", data.funnel.cancelled],
        ["Urgentes", data.funnel.urgent],
      ],
    },
    {
      title: "Piezas en curso por ubicación (hoy)",
      header: ["Ubicación", "Piezas"],
      rows: data.by_location.map((l) => [
        label(PIECE_LOCATION_LABELS, l.key),
        l.value,
      ]),
    },
    {
      title: "Tiempo de cumplimiento",
      header: ["Tramo", "Piezas"],
      rows: data.fulfillment.buckets.map((b) => [b.label, b.value]),
    },
  ]);
}

export function clientsCsv(data: DashboardClients, period: string): string {
  return csvDocument("Dashboard · Clientes", period, [
    {
      title: "Resumen",
      header: ["Indicador", "Valor"],
      rows: [
        ["Clientes registrados (hoy)", data.total_active],
        ["Clientes nuevos", data.new_clients],
        ["Clientes con guías en el periodo", data.active_in_range],
        ["Clientes que ya habían traído piezas", data.returning],
        ["Recompra (%)", data.repeat_rate],
      ],
    },
    {
      title: "Clientes nuevos",
      header: ["Desde", "Nuevos"],
      rows: data.series.map((p) => [p.d, p.nuevos]),
    },
    {
      title: "Mejores clientes",
      header: [
        "Cliente",
        "Guías",
        "Piezas",
        "Vendido (S/)",
        "Última aprobación",
      ],
      rows: data.top_clients.map((c) => [
        c.name,
        c.orders,
        c.pieces,
        c.sold,
        c.last_at,
      ]),
    },
    {
      title: "Ventas por región",
      header: ["Región", "Clientes", "Guías", "Vendido (S/)"],
      rows: data.regions.map((r) => [
        regionName(r.region),
        r.clients,
        r.orders,
        r.sold,
      ]),
    },
    {
      title: "Saldo por cobrar (hoy)",
      header: ["Cliente", "Guías", "Saldo (S/)"],
      rows: data.top_debtors.map((d) => [d.name, d.orders, d.due]),
    },
  ]);
}

export function workshopsCsv(data: DashboardWorkshops, period: string): string {
  const withCost = data.total.cost !== null;
  return csvDocument("Dashboard · Talleres", period, [
    {
      title: "Por taller",
      header: [
        "Taller",
        "Enviadas",
        "Devueltas",
        "Promedio (días)",
        "Mediana (días)",
        "Máximo (días)",
        "Observadas",
        "En taller hoy",
        `Con ${data.alert_days}+ días hoy`,
        ...(withCost ? ["Costo (S/)"] : []),
      ],
      rows: data.workshops.map((w) => [
        w.name,
        w.sent,
        w.returned,
        w.avg_days,
        w.median_days,
        w.max_days,
        w.observed,
        w.in_workshop,
        w.over_alert,
        ...(withCost ? [w.cost] : []),
      ]),
    },
    {
      title: "General",
      header: ["Indicador", "Valor"],
      rows: [
        ["Piezas devueltas", data.total.returned],
        ["Promedio (días)", data.total.avg_days],
        ["Mediana (días)", data.total.median_days],
        ["En taller hoy", data.total.in_workshop],
        [`Con ${data.alert_days}+ días hoy`, data.total.over_alert],
      ],
    },
    {
      title: "Días en taller de las piezas devueltas",
      header: ["Tramo", "Piezas"],
      rows: data.total.buckets.map((b) => [b.label, b.value]),
    },
  ]);
}

export function sellersCsv(data: DashboardSellers, period: string): string {
  return csvDocument(
    data.scope === "propio"
      ? "Dashboard · Mi desempeño"
      : "Dashboard · Vendedores",
    period,
    [
      {
        title: "Por vendedor",
        header: [
          "Vendedor",
          "Guías",
          "Vendido (S/)",
          "Guías con ventas",
          "Ticket (S/)",
          "Cobrado (S/)",
          "Piezas registradas",
          "Piezas aprobadas",
          "Aprobación (%)",
          "Cotizaciones WhatsApp",
          "Con pedido",
        ],
        rows: data.sellers.map((s) => [
          s.name,
          s.orders,
          s.sold,
          s.sold_orders,
          s.ticket,
          s.collected,
          s.pieces,
          s.approved,
          s.approval_rate,
          s.cwa_created,
          s.cwa_converted,
        ]),
      },
    ],
  );
}

export function quotesCsv(data: DashboardQuotes, period: string): string {
  const { cwa, cot } = data;
  return csvDocument("Dashboard · Cotizaciones", period, [
    {
      title: "Cotizaciones de WhatsApp",
      header: ["Indicador", "Valor"],
      rows: [
        ["Cotizadas", cwa.created],
        ["Sin pedido todavía", cwa.cotizada],
        ["Pedidas en parte", cwa.pedida_parcial],
        ["Pedidas completas", cwa.pedida],
        ["Descartadas", cwa.descartada],
        ["Conversión (%)", cwa.conversion],
        ["Piezas cotizadas", cwa.items_quoted],
        ["Piezas pedidas", cwa.items_ordered],
        ["Piezas pedidas sobre cotizadas (%)", cwa.item_conversion],
        ["Monto cotizado (S/)", cwa.quoted_amount],
        ["Monto pedido (S/)", cwa.ordered_amount],
      ],
    },
    {
      title: "Cotizadas y pedidas",
      header: ["Desde", "Cotizadas", "Con pedido"],
      rows: data.series.map((p) => [p.d, p.cotizadas, p.pedidas]),
    },
    {
      title: "Motivos de descarte",
      header: ["Motivo", "Cotizaciones"],
      rows: data.discard_reasons.map((r) => [r.label, r.value]),
    },
    {
      title: "Cotizador (COT)",
      header: ["Indicador", "Valor"],
      rows: [
        ["Cotizaciones creadas", cot.created],
        ["Borradores", cot.borrador],
        ["Emitidas", cot.emitida],
        ["Aceptadas", cot.aceptada],
        ["Rechazadas", cot.rechazada],
        ["Vencidas", cot.vencida],
        ["Aceptación (%)", cot.acceptance],
        ["Monto emitido (S/)", cot.amount],
        ["Monto aceptado (S/)", cot.accepted_amount],
      ],
    },
    {
      title: "Oficina frente a WhatsApp",
      header: ["Origen", "Guías", "Vendido (S/)", "Ticket (S/)"],
      rows: data.by_origin.map((o) => [
        label(RESTORATION_ORIGIN_LABELS, o.key),
        o.orders,
        o.sold,
        o.ticket,
      ]),
    },
  ]);
}

/** Nombre del archivo: «dashboard-ventas-2026-10-01_2026-10-27.csv». */
export function dashboardCsvFilename(
  area: DashboardArea,
  range: { from: string; to: string },
): string {
  return `dashboard-${area}-${range.from}_${range.to}.csv`;
}

export { DASHBOARD_AREA_LABELS };
