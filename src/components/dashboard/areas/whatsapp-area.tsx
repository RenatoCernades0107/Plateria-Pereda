import { MessageCircle, PackageCheck, Percent } from "lucide-react";

import { BarList, Meter, StackedBar } from "@/components/dashboard/bars";
import { WHATSAPP_STATUS_COLORS } from "@/components/dashboard/colors";
import { KpiTile } from "@/components/dashboard/kpi";
import { KpiGrid, Panel, PanelEmpty } from "@/components/dashboard/panel";
import { TimeSeriesChart } from "@/components/dashboard/time-series-chart";
import { METRIC_HELP } from "@/domain/dashboard-help";
import { dashboardScopes } from "@/domain/dashboard-scope";
import { seriesPoints } from "@/domain/dashboard-charts";
import {
  formatCount,
  formatPercent,
  formatSolesWhole,
} from "@/domain/dashboard-format";
import {
  BUCKET_LABELS,
  bucketFor,
  type DashboardRange,
} from "@/domain/dashboard-range";
import {
  RESTORATION_ORIGIN_LABELS,
  type RestorationOrigin,
} from "@/domain/restoration-status";
import { WHATSAPP_QUOTE_STATUS_LABELS } from "@/domain/whatsapp-quotes";
import { dashboardQuotes } from "@/server/dashboard-metrics";

export async function WhatsappArea({
  range,
  today,
}: {
  range: DashboardRange;
  /** Hoy en Lima ("AAAA-MM-DD"), para las etiquetas de tiempo. */
  today: string;
}) {
  const scope = dashboardScopes(range, today);
  const data = await dashboardQuotes(range);
  const bucket = bucketFor(range);
  const points = seriesPoints(data.series, bucket);
  const { cwa } = data;
  const cwaSegments = (
    ["cotizada", "pedida_parcial", "pedida", "descartada"] as const
  )
    .map((key) => ({
      key,
      label: WHATSAPP_QUOTE_STATUS_LABELS[key],
      value: cwa[key],
      color: WHATSAPP_STATUS_COLORS[key],
    }))
    .filter((s) => s.value > 0);
  const itemRate =
    cwa.items_quoted > 0 ? (cwa.items_ordered / cwa.items_quoted) * 100 : null;

  return (
    <>
      <KpiGrid>
        <KpiTile
          testId="kpi-cwa-cotizadas"
          scope={scope.periodo}
          icon={MessageCircle}
          label="Cotizaciones de WhatsApp"
          value={formatCount(cwa.created)}
          hint={`${formatSolesWhole(cwa.quoted_amount)} cotizados`}
        />
        <KpiTile
          testId="kpi-cwa-conversion"
          scope={scope.cohorte}
          info={METRIC_HELP.conversionWhatsapp}
          icon={Percent}
          label="Cotizaciones que se piden"
          value={formatPercent(cwa.conversion, 0)}
          hint={`${cwa.pedida + cwa.pedida_parcial} de ${cwa.created} terminaron en pedido`}
        />
        <KpiTile
          testId="kpi-cwa-monto-pedido"
          scope={scope.cohorte}
          info={METRIC_HELP.montoPedido}
          icon={PackageCheck}
          label="Monto pedido"
          value={formatSolesWhole(cwa.ordered_amount)}
          hint={
            cwa.quoted_amount > 0
              ? `${formatPercent((cwa.ordered_amount / cwa.quoted_amount) * 100, 0)} de lo cotizado`
              : undefined
          }
        />
      </KpiGrid>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel
          title="Cotizaciones de WhatsApp"
          description="Estado de las cotizadas en el periodo"
          testId="panel-cwa"
          scope={scope.cohorte}
        >
          {cwaSegments.length === 0 ? (
            <PanelEmpty />
          ) : (
            <StackedBar segments={cwaSegments} />
          )}
        </Panel>
        <Panel
          title="Piezas cotizadas y pedidas"
          description="Cuántas de las piezas cotizadas el cliente terminó pidiendo"
          testId="panel-cwa-piezas"
          scope={scope.cohorte}
          info={METRIC_HELP.piezasPedidas}
        >
          {cwa.items_quoted === 0 ? (
            <PanelEmpty />
          ) : (
            <Meter
              value={itemRate}
              label="Piezas pedidas sobre cotizadas"
              caption={`${cwa.items_ordered} de ${cwa.items_quoted} piezas · ${formatSolesWhole(cwa.ordered_amount)} de ${formatSolesWhole(cwa.quoted_amount)}`}
            />
          )}
        </Panel>
      </div>

      <Panel
        title="Cotizadas y pedidas en el tiempo"
        description={`Cotizaciones de WhatsApp ${BUCKET_LABELS[bucket]}`}
        testId="grafico-cwa"
        scope={scope.cohorte}
      >
        <TimeSeriesChart
          data={points}
          valueKind="count"
          ariaLabel={`Cotizaciones de WhatsApp cotizadas y pedidas ${BUCKET_LABELS[bucket]}`}
          series={[
            {
              key: "cotizadas",
              label: "Cotizadas",
              color: "var(--viz-1)",
              kind: "bar",
            },
            {
              key: "pedidas",
              label: "Con pedido",
              color: "var(--viz-2)",
              kind: "bar",
            },
          ]}
        />
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel
          title="¿Por qué se descartan?"
          description="Motivos escritos al descartar, agrupados"
          testId="panel-motivos"
          scope={scope.periodo}
        >
          {data.discard_reasons.length === 0 ? (
            <PanelEmpty>
              No se descartó ninguna cotización en el periodo.
            </PanelEmpty>
          ) : (
            <BarList
              items={data.discard_reasons.map((r) => ({
                ...r,
                label: r.label.charAt(0).toUpperCase() + r.label.slice(1),
              }))}
              format={formatCount}
            />
          )}
        </Panel>
        <Panel
          title="Oficina frente a WhatsApp"
          description="Guías normales del periodo según su origen"
          testId="panel-origen"
          scope={scope.periodo}
        >
          <ul className="grid gap-3 sm:grid-cols-2">
            {data.by_origin.map((o) => (
              <li key={o.key} className="bg-muted/40 rounded-lg p-4">
                <p className="text-muted-foreground text-xs">
                  {RESTORATION_ORIGIN_LABELS[o.key as RestorationOrigin] ??
                    o.key}
                </p>
                <p className="text-heading mt-1 text-xl font-semibold">
                  {formatSolesWhole(o.sold)}
                </p>
                <p className="text-muted-foreground text-xs">
                  {o.orders} {o.orders === 1 ? "guía" : "guías"} · ticket{" "}
                  {formatSolesWhole(o.ticket)}
                </p>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </>
  );
}
