import { CheckCircle2, Gauge, Layers, ScrollText, Timer } from "lucide-react";

import { BarList, Funnel, StackedBar } from "@/components/dashboard/bars";
import { RESTORATION_STATUS_COLORS } from "@/components/dashboard/colors";
import { KpiTile } from "@/components/dashboard/kpi";
import { KpiGrid, Panel, PanelEmpty } from "@/components/dashboard/panel";
import { TimeSeriesChart } from "@/components/dashboard/time-series-chart";
import { METRIC_HELP } from "@/domain/dashboard-help";
import { dashboardScopes } from "@/domain/dashboard-scope";
import {
  approvalRate,
  funnelLosses,
  funnelSteps,
  orderedCounts,
  seriesPoints,
} from "@/domain/dashboard-charts";
import {
  formatCount,
  formatDays,
  formatPercent,
} from "@/domain/dashboard-format";
import {
  BUCKET_LABELS,
  bucketFor,
  type DashboardRange,
} from "@/domain/dashboard-range";
import {
  PIECE_LOCATION_LABELS,
  RESTORATION_KIND_LABELS,
  RESTORATION_STATUSES,
  RESTORATION_STATUS_LABELS,
} from "@/domain/restoration-status";
import { dashboardOrders } from "@/server/dashboard-metrics";

const LOCATION_ORDER = ["por_whatsapp", "sin_enviar", "en_taller", "en_tienda"];
const KIND_ORDER = ["normal", "interno", "observado"];

export async function OrdersArea({
  range,
  today,
}: {
  range: DashboardRange;
  /** Hoy en Lima ("AAAA-MM-DD"), para las etiquetas de tiempo. */
  today: string;
}) {
  const scope = dashboardScopes(range, today);
  const orders = await dashboardOrders(range);
  const bucket = bucketFor(range);
  const points = seriesPoints(orders.series, bucket);
  const statusSegments = orderedCounts(
    orders.by_status,
    RESTORATION_STATUSES,
    RESTORATION_STATUS_LABELS,
  ).map((s) => ({
    ...s,
    color:
      RESTORATION_STATUS_COLORS[
        s.key as keyof typeof RESTORATION_STATUS_COLORS
      ] ?? "bg-muted-foreground/40",
  }));
  const locations = orderedCounts(
    orders.by_location,
    LOCATION_ORDER,
    PIECE_LOCATION_LABELS,
  );
  const kinds = orderedCounts(
    orders.by_kind,
    KIND_ORDER,
    RESTORATION_KIND_LABELS,
  );
  const inProgress = locations.reduce((sum, l) => sum + l.value, 0);
  const rate = approvalRate(orders.funnel);

  return (
    <>
      <KpiGrid>
        <KpiTile
          testId="kpi-guias"
          scope={scope.periodo}
          icon={ScrollText}
          label="Guías registradas"
          value={formatCount(orders.orders)}
          hint={
            orders.pieces_per_order !== null
              ? `${formatCount(orders.pieces_per_order)} piezas por guía`
              : "Sin guías en el periodo"
          }
        />
        <KpiTile
          testId="kpi-aprobacion"
          scope={scope.cohorte}
          info={METRIC_HELP.aprobacion}
          icon={CheckCircle2}
          label="Piezas aprobadas"
          value={formatPercent(rate, 0)}
          hint={`${orders.funnel.approved} de ${orders.funnel.registered} registradas`}
        />
        <KpiTile
          testId="kpi-cumplimiento"
          scope={scope.periodo}
          info={METRIC_HELP.cumplimiento}
          icon={Timer}
          label="Cumplimiento promedio"
          value={formatDays(orders.fulfillment.avg)}
          hint={`Mediana ${formatDays(orders.fulfillment.median)} · 9 de cada 10 en ${formatDays(orders.fulfillment.p90)}`}
        />
        <KpiTile
          testId="kpi-en-curso"
          scope={scope.hoy}
          info={METRIC_HELP.enCurso}
          icon={Layers}
          label="Piezas en curso hoy"
          value={formatCount(inProgress)}
          hint="Sin entregar ni anular"
        />
      </KpiGrid>

      <Panel
        title="Guías y entregas"
        description={`Guías registradas y piezas entregadas · ${BUCKET_LABELS[bucket]}`}
        testId="grafico-actividad"
        scope={scope.periodo}
      >
        <TimeSeriesChart
          testId="grafico-guias-entregas"
          data={points}
          valueKind="count"
          ariaLabel={`Guías registradas y piezas entregadas ${BUCKET_LABELS[bucket]}`}
          series={[
            {
              key: "guias",
              label: "Guías registradas",
              color: "var(--viz-1)",
              kind: "bar",
            },
            {
              key: "entregadas",
              label: "Piezas entregadas",
              color: "var(--viz-2)",
              kind: "bar",
            },
          ]}
        />
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel
          title="Estado de las guías"
          description="De las guías registradas en el periodo"
          testId="panel-estados"
          scope={scope.cohorte}
        >
          {statusSegments.length === 0 ? (
            <PanelEmpty />
          ) : (
            <StackedBar segments={statusSegments} />
          )}
          {kinds.length > 1 ? (
            <p className="text-muted-foreground mt-4 text-xs">
              Además se registraron:{" "}
              {kinds
                .filter((k) => k.key !== "normal")
                .map(
                  (k) =>
                    `${k.value} ${k.label.toLowerCase()}${k.value === 1 ? "" : "s"}`,
                )
                .join(" y ")}
              .
            </p>
          ) : null}
        </Panel>

        <Panel
          title="Camino de las piezas"
          description="De las piezas registradas en el periodo: cuántas se aprueban y se entregan"
          testId="panel-embudo"
          scope={scope.cohorte}
          info={METRIC_HELP.caminoPiezas}
        >
          {orders.funnel.registered === 0 ? (
            <PanelEmpty />
          ) : (
            <Funnel
              testId="embudo"
              steps={funnelSteps(orders.funnel)}
              losses={funnelLosses(orders.funnel)}
            />
          )}
          {orders.funnel.urgent > 0 ? (
            <p className="text-muted-foreground mt-4 text-xs">
              {orders.funnel.urgent} de las piezas registradas son urgentes.
            </p>
          ) : null}
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel
          title="Piezas en curso por ubicación"
          description="Dónde está cada pieza sin entregar ni anular"
          testId="panel-ubicacion"
          scope={scope.hoy}
        >
          {locations.length === 0 ? (
            <PanelEmpty>No hay piezas en curso.</PanelEmpty>
          ) : (
            <BarList
              items={locations.map((l) => ({
                key: l.key,
                label: l.label,
                value: l.value,
              }))}
              format={formatCount}
            />
          )}
        </Panel>
        <Panel
          title="Tiempo de cumplimiento"
          description="Días desde que se registra la pieza hasta que se entrega"
          icon={Gauge}
          testId="panel-cumplimiento"
          scope={scope.periodo}
        >
          {orders.fulfillment.delivered === 0 ? (
            <PanelEmpty>No hubo entregas en el periodo.</PanelEmpty>
          ) : (
            <BarList items={orders.fulfillment.buckets} format={formatCount} />
          )}
        </Panel>
      </div>
    </>
  );
}
