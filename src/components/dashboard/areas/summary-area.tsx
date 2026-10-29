import {
  Banknote,
  CheckCircle2,
  Clock,
  Gem,
  MessageCircle,
  Receipt,
  ScrollText,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";

import { HeroStat, KpiTile } from "@/components/dashboard/kpi";
import { KpiGrid, Panel } from "@/components/dashboard/panel";
import { PendingCounts } from "@/components/dashboard/pending-counts";
import { TimeSeriesChart } from "@/components/dashboard/time-series-chart";
import { seriesPoints, sparkValues } from "@/domain/dashboard-charts";
import {
  computeDelta,
  formatCount,
  formatDays,
  formatPercent,
  formatSolesWhole,
} from "@/domain/dashboard-format";
import { summaryInsights } from "@/domain/dashboard-insights";
import {
  BUCKET_LABELS,
  bucketFor,
  formatRange,
  previousRange,
  type DashboardRange,
} from "@/domain/dashboard-range";
import { dashboardSummaryWithPrevious } from "@/server/dashboard-metrics";

export async function SummaryArea({
  range,
  canMargins,
}: {
  range: DashboardRange;
  canMargins: boolean;
}) {
  const { current, previous } = await dashboardSummaryWithPrevious(range);
  const bucket = bucketFor(range);
  const points = seriesPoints(current.series, bucket);
  const insights = summaryInsights(current, previous, bucket);
  const previousText = `vs ${formatRange(previousRange(range))}`;

  return (
    <>
      <HeroStat
        testId="kpi-vendido"
        label="Vendido en el periodo"
        value={formatSolesWhole(current.sold)}
        delta={computeDelta(current.sold, previous.sold)}
        previousLabel={previousText}
        spark={sparkValues(current.series, "vendido")}
      >
        <ul
          className="grid gap-x-8 gap-y-2 text-sm md:grid-cols-2"
          data-testid="insights"
        >
          {insights.map((insight) => (
            <li key={insight.key} className="text-foreground flex gap-2">
              <Sparkles
                aria-hidden
                className="text-primary mt-0.5 size-4 shrink-0"
              />
              <span>{insight.text}</span>
            </li>
          ))}
          {canMargins && current.margin !== null ? (
            <li
              className="text-foreground flex gap-2"
              data-testid="insight-margen"
            >
              <Banknote
                aria-hidden
                className="text-primary mt-0.5 size-4 shrink-0"
              />
              <span>
                Margen estimado de lo vendido con costo:{" "}
                <strong className="text-heading">
                  {formatSolesWhole(current.margin)}
                </strong>
                {current.margin_pct !== null
                  ? ` (${formatPercent(current.margin_pct, 0)})`
                  : ""}
                .
              </span>
            </li>
          ) : null}
        </ul>
      </HeroStat>

      <KpiGrid>
        <KpiTile
          testId="kpi-cobrado"
          icon={Wallet}
          label="Cobrado"
          value={formatSolesWhole(current.collected)}
          delta={computeDelta(current.collected, previous.collected)}
          spark={sparkValues(current.series, "cobrado")}
          hint={
            current.refunds > 0
              ? `Tras ${formatSolesWhole(current.refunds)} en reembolsos`
              : "Pagos recibidos menos reembolsos"
          }
        />
        <KpiTile
          testId="kpi-saldo"
          icon={Clock}
          label="Saldo por cobrar hoy"
          value={formatSolesWhole(current.balance_due)}
          hint="Lo aprobado que aún no se cobra"
        />
        <KpiTile
          testId="kpi-ticket"
          icon={Receipt}
          label="Ticket promedio"
          value={formatSolesWhole(current.ticket)}
          delta={computeDelta(current.ticket, previous.ticket)}
          hint={`${formatCount(current.sold_orders)} guías con ventas`}
        />
        <KpiTile
          testId="kpi-guias"
          icon={ScrollText}
          label="Guías registradas"
          value={formatCount(current.orders)}
          delta={computeDelta(current.orders, previous.orders)}
          spark={sparkValues(current.series, "guias")}
        />
        <KpiTile
          testId="kpi-entregadas"
          icon={CheckCircle2}
          label="Piezas entregadas"
          value={formatCount(current.delivered)}
          delta={computeDelta(current.delivered, previous.delivered)}
        />
        <KpiTile
          testId="kpi-cumplimiento"
          icon={Gem}
          label="Cumplimiento promedio"
          value={formatDays(current.fulfillment_avg)}
          delta={computeDelta(
            current.fulfillment_avg,
            previous.fulfillment_avg,
          )}
          upIsGood={false}
          hint={
            current.fulfillment_median !== null
              ? `Mediana ${formatDays(current.fulfillment_median)}`
              : "Sin entregas en el periodo"
          }
        />
        <KpiTile
          testId="kpi-clientes-nuevos"
          icon={Users}
          label="Clientes nuevos"
          value={formatCount(current.new_clients)}
          delta={computeDelta(current.new_clients, previous.new_clients)}
        />
        <KpiTile
          testId="kpi-conversion"
          icon={MessageCircle}
          label="Conversión de WhatsApp"
          value={formatPercent(current.cwa_conversion, 0)}
          hint={
            current.cwa_created > 0
              ? `${current.cwa_converted} de ${current.cwa_created} cotizaciones`
              : "Sin cotizaciones en el periodo"
          }
        />
      </KpiGrid>

      <Panel
        title="Vendido y cobrado"
        description={`Por fecha de aprobación y de pago, ${BUCKET_LABELS[bucket]}`}
        testId="grafico-ventas"
      >
        <TimeSeriesChart
          testId="grafico-vendido-cobrado"
          data={points}
          valueKind="money"
          ariaLabel={`Vendido y cobrado ${BUCKET_LABELS[bucket]}`}
          series={[
            {
              key: "vendido",
              label: "Vendido",
              color: "var(--viz-1)",
              kind: "area",
            },
            {
              key: "cobrado",
              label: "Cobrado",
              color: "var(--viz-2)",
              kind: "line",
            },
          ]}
        />
      </Panel>

      <PendingCounts showMoney />
    </>
  );
}
