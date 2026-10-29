import { bucketLabel } from "./dashboard-charts";
import {
  computeDelta,
  formatDays,
  formatPercent,
  formatSolesWhole,
} from "./dashboard-format";
import type { Bucket } from "./dashboard-range";
import type { DashboardSummary } from "./dashboard-schemas";

export type Insight = { key: string; text: string };

const BUCKET_NOUN: Record<Bucket, string> = {
  dia: "día",
  semana: "semana",
  mes: "mes",
};

/**
 * Frases cortas con lo más llamativo del periodo, para leer de un vistazo. Solo dice lo
 * que los datos sostienen: sin ventas no hay «mejor día», sin periodo anterior comparable
 * no hay «más/menos que antes».
 */
export function summaryInsights(
  current: DashboardSummary,
  previous: DashboardSummary,
  bucket: Bucket,
): Insight[] {
  const insights: Insight[] = [];

  const delta = computeDelta(current.sold, previous.sold);
  if (delta.kind === "up" && delta.pct !== null) {
    insights.push({
      key: "tendencia",
      text: `Vendiste ${formatPercent(delta.pct, 0)} más que en el periodo anterior.`,
    });
  } else if (delta.kind === "down" && delta.pct !== null) {
    insights.push({
      key: "tendencia",
      text: `Vendiste ${formatPercent(Math.abs(delta.pct), 0)} menos que en el periodo anterior.`,
    });
  } else if (delta.kind === "new") {
    insights.push({
      key: "tendencia",
      text: "Volvieron las ventas: el periodo anterior no tuvo ninguna.",
    });
  }

  const best = current.series.reduce<DashboardSummary["series"][number] | null>(
    (top, point) => (point.vendido > (top?.vendido ?? 0) ? point : top),
    null,
  );
  if (best && best.vendido > 0 && current.series.length > 1) {
    const where =
      bucket === "dia"
        ? `el ${bucketLabel(best.d, bucket)}`
        : bucket === "semana"
          ? `la del ${bucketLabel(best.d, bucket)}`
          : bucketLabel(best.d, bucket, true);
    insights.push({
      key: "mejor",
      text: `Tu mejor ${BUCKET_NOUN[bucket]} fue ${where} con ${formatSolesWhole(best.vendido)}.`,
    });
  }

  if (current.sold > 0) {
    const rate = Math.round((current.collected / current.sold) * 100);
    insights.push({
      key: "cobranza",
      text: `Cobraste el ${rate} % de lo que vendiste en el periodo; hoy hay ${formatSolesWhole(current.balance_due)} por cobrar en total.`,
    });
  } else if (current.balance_due > 0) {
    insights.push({
      key: "cobranza",
      text: `Hay ${formatSolesWhole(current.balance_due)} por cobrar en total.`,
    });
  }

  if (current.fulfillment_avg !== null && current.delivered > 0) {
    insights.push({
      key: "cumplimiento",
      text: `Una pieza tarda en promedio ${formatDays(current.fulfillment_avg)} desde que se registra hasta que se entrega.`,
    });
  }

  if (current.cwa_created > 0) {
    insights.push({
      key: "whatsapp",
      text: `${current.cwa_converted} de ${current.cwa_created} cotizaciones de WhatsApp terminaron en pedido.`,
    });
  }

  return insights.slice(0, 4);
}
