import {
  Banknote,
  BadgeCheck,
  CheckCircle2,
  Clock,
  Gem,
  Hourglass,
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
import { METRIC_HELP } from "@/domain/dashboard-help";
import { dashboardScopes } from "@/domain/dashboard-scope";
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
import {
  parsePieceBoardFilters,
  pieceBoardHref,
} from "@/domain/piece-board-filters";
import {
  parseRestorationFilters,
  restorationFiltersHref,
} from "@/domain/restoration-filters";
import { dashboardSummaryWithPrevious } from "@/server/dashboard-metrics";

export async function SummaryArea({
  range,
  today,
  canMargins,
}: {
  range: DashboardRange;
  /** Hoy en Lima ("AAAA-MM-DD"), para las etiquetas de tiempo. */
  today: string;
  canMargins: boolean;
}) {
  const scope = dashboardScopes(range, today);
  const { current, previous } = await dashboardSummaryWithPrevious(range);
  const bucket = bucketFor(range);
  const points = seriesPoints(current.series, bucket);
  const insights = summaryInsights(current, previous, bucket);
  const previousText = `vs ${formatRange(previousRange(range))}`;
  const pieceBase = parsePieceBoardFilters({});
  const restorationBase = parseRestorationFilters({});

  return (
    <>
      <HeroStat
        testId="kpi-vendido"
        info={METRIC_HELP.vendido}
        scope={scope.periodo}
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
          scope={scope.periodo}
          info={METRIC_HELP.cobrado}
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
          scope={scope.hoy}
          info={METRIC_HELP.saldo}
          icon={Clock}
          label="Saldo por cobrar hoy"
          value={formatSolesWhole(current.balance_due)}
          hint="Lo aprobado que aún no se cobra"
        />
        <KpiTile
          testId="kpi-ticket"
          scope={scope.periodo}
          info={METRIC_HELP.ticket}
          icon={Receipt}
          label="Ticket promedio"
          value={formatSolesWhole(current.ticket)}
          delta={computeDelta(current.ticket, previous.ticket)}
          hint={`${formatCount(current.sold_orders)} guías con ventas`}
        />
        <KpiTile
          testId="kpi-guias"
          scope={scope.periodo}
          icon={ScrollText}
          label="Guías registradas"
          value={formatCount(current.orders)}
          delta={computeDelta(current.orders, previous.orders)}
          spark={sparkValues(current.series, "guias")}
        />
        <KpiTile
          testId="kpi-entregadas"
          scope={scope.periodo}
          icon={CheckCircle2}
          label="Piezas entregadas"
          value={formatCount(current.delivered)}
          delta={computeDelta(current.delivered, previous.delivered)}
        />
        <KpiTile
          testId="kpi-cumplimiento"
          scope={scope.periodo}
          info={METRIC_HELP.cumplimiento}
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
          scope={scope.periodo}
          icon={Users}
          label="Clientes nuevos"
          value={formatCount(current.new_clients)}
          delta={computeDelta(current.new_clients, previous.new_clients)}
        />
        <KpiTile
          testId="kpi-conversion"
          scope={scope.cohorte}
          info={METRIC_HELP.conversionWhatsapp}
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

      <section
        aria-labelledby="antes-y-despues-de-aprobar"
        className="space-y-3"
        data-testid="antes-y-despues-de-aprobar"
      >
        <div>
          <h2
            id="antes-y-despues-de-aprobar"
            className="text-heading text-lg font-semibold tracking-tight"
          >
            Antes y después de aprobar
          </h2>
          <p className="text-muted-foreground text-sm">
            Las guías y piezas en curso. Toca una tarjeta para ver la lista.
          </p>
        </div>
        <KpiGrid>
          <KpiTile
            testId="kpi-guias-antes"
            scope={scope.hoy}
            info={METRIC_HELP.guiasAntesAprobar}
            icon={Hourglass}
            label="Guías antes de aprobar"
            value={formatCount(current.guides_before_approval)}
            hint="Registradas, sin ninguna pieza aprobada"
            href={restorationFiltersHref(restorationBase, {
              status: ["registrada"],
            })}
          />
          <KpiTile
            testId="kpi-guias-aprobadas"
            scope={scope.hoy}
            info={METRIC_HELP.guiasAprobadas}
            icon={BadgeCheck}
            label="Guías aprobadas"
            value={formatCount(current.guides_approved)}
            hint="Con piezas aprobadas, aún en curso"
            href={restorationFiltersHref(restorationBase, {
              status: [
                "parcialmente_aprobada",
                "aprobada",
                "parcialmente_lista",
                "lista",
              ],
            })}
          />
          <KpiTile
            testId="kpi-piezas-antes"
            scope={scope.hoy}
            info={METRIC_HELP.piezasAntesAprobar}
            icon={Hourglass}
            label="Piezas antes de aprobar"
            value={formatCount(current.pieces_before_approval)}
            hint="Registradas, en consulta o en espera del cliente"
            href={pieceBoardHref(pieceBase, {
              status: ["registrada", "en_consulta", "en_espera"],
            })}
          />
          <KpiTile
            testId="kpi-piezas-aprobadas"
            scope={scope.hoy}
            info={METRIC_HELP.piezasAprobadas}
            icon={BadgeCheck}
            label="Piezas aprobadas"
            value={formatCount(current.pieces_approved)}
            hint="Aprobadas u observadas, aún en curso"
            href={pieceBoardHref(pieceBase, {
              status: ["aprobada", "observada"],
            })}
          />
        </KpiGrid>
      </section>

      <Panel
        title="Vendido y cobrado"
        description={`Por fecha de aprobación y de pago, ${BUCKET_LABELS[bucket]}`}
        scope={scope.periodo}
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

      <PendingCounts showMoney scope={scope.hoy} />
    </>
  );
}
