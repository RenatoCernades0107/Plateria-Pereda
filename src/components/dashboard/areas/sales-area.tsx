import {
  Banknote,
  CircleDollarSign,
  PackageCheck,
  Receipt,
  ScrollText,
  Wallet,
} from "lucide-react";

import { StackedBar, BarList, Meter } from "@/components/dashboard/bars";
import { KpiTile } from "@/components/dashboard/kpi";
import { KpiGrid, Panel, PanelEmpty } from "@/components/dashboard/panel";
import { TimeSeriesChart } from "@/components/dashboard/time-series-chart";
import { METRIC_HELP } from "@/domain/dashboard-help";
import { dashboardScopes } from "@/domain/dashboard-scope";
import {
  seriesPoints,
  sparkValues,
  topWithOthers,
  withCountHint,
} from "@/domain/dashboard-charts";
import {
  computeDelta,
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
  parsePieceBoardFilters,
  pieceBoardHref,
} from "@/domain/piece-board-filters";
import {
  parseRestorationFilters,
  restorationFiltersHref,
} from "@/domain/restoration-filters";
import {
  RESTORATION_ORIGIN_LABELS,
  type RestorationOrigin,
} from "@/domain/restoration-status";
import {
  dashboardSales,
  dashboardSummaryWithPrevious,
} from "@/server/dashboard-metrics";

const ORIGIN_COLORS: Record<string, string> = {
  oficina: "bg-viz-1",
  whatsapp: "bg-viz-3",
};

export async function SalesArea({
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
  const [sales, { current, previous }] = await Promise.all([
    dashboardSales(range),
    dashboardSummaryWithPrevious(range),
  ]);
  const bucket = bucketFor(range);
  const points = seriesPoints(sales.series, bucket);
  const originSegments = sales.by_origin
    .filter((o) => o.sold > 0)
    .map((o) => ({
      key: o.key,
      label: RESTORATION_ORIGIN_LABELS[o.key as RestorationOrigin] ?? o.key,
      value: o.sold,
      color: ORIGIN_COLORS[o.key] ?? "bg-viz-4",
    }));
  const ready = sales.ready_to_collect;
  // Las listas por cobrar llevan al listado ya filtrado (el de piezas no filtra por pago).
  const readyPiecesHref = pieceBoardHref(parsePieceBoardFilters({}), {
    ready: true,
  });
  const readyGuidesHref = restorationFiltersHref(parseRestorationFilters({}), {
    status: ["parcialmente_lista", "lista"],
    paymentStatus: ["pendiente", "parcial"],
  });

  return (
    <>
      <KpiGrid>
        <KpiTile
          testId="kpi-vendido"
          scope={scope.periodo}
          info={METRIC_HELP.vendido}
          icon={CircleDollarSign}
          label="Vendido"
          value={formatSolesWhole(sales.sold)}
          delta={computeDelta(current.sold, previous.sold)}
          spark={sparkValues(current.series, "vendido")}
          hint="Piezas aprobadas en el periodo"
        />
        <KpiTile
          testId="kpi-cobrado"
          scope={scope.periodo}
          info={METRIC_HELP.cobrado}
          icon={Wallet}
          label="Cobrado"
          value={formatSolesWhole(sales.collected)}
          delta={computeDelta(current.collected, previous.collected)}
          spark={sparkValues(current.series, "cobrado")}
          hint="Pagos menos reembolsos"
        />
        <KpiTile
          testId="kpi-ticket"
          scope={scope.periodo}
          info={METRIC_HELP.ticket}
          icon={Receipt}
          label="Ticket promedio"
          value={formatSolesWhole(current.ticket)}
          delta={computeDelta(current.ticket, previous.ticket)}
          hint={`${current.sold_orders} guías · ${current.sold_pieces} piezas`}
        />
        <KpiTile
          testId="kpi-saldo"
          scope={scope.hoy}
          info={METRIC_HELP.saldo}
          icon={Banknote}
          label="Saldo por cobrar hoy"
          value={formatSolesWhole(current.balance_due)}
          hint="Lo aprobado que aún no se cobra"
        />
        <KpiTile
          testId="kpi-listas-piezas"
          scope={scope.hoy}
          info={METRIC_HELP.listasPiezasPorCobrar}
          icon={PackageCheck}
          label="Piezas listas por cobrar"
          value={formatCount(ready.pieces)}
          hint="Listas para entregar en guías con saldo"
          href={readyPiecesHref}
        />
        <KpiTile
          testId="kpi-listas-guias"
          scope={scope.hoy}
          info={METRIC_HELP.listasGuiasPorCobrar}
          icon={ScrollText}
          label="Guías listas por cobrar"
          value={formatCount(ready.guides)}
          hint={`${formatSolesWhole(ready.guides_balance)} por cobrar`}
          href={readyGuidesHref}
        />
      </KpiGrid>

      <Panel
        title="Vendido y cobrado"
        description={`Vendido por fecha de aprobación, cobrado por fecha de pago · ${BUCKET_LABELS[bucket]}`}
        testId="grafico-ventas"
        scope={scope.periodo}
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

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel
          title="Cobranza"
          description="Cuánto de lo vendido ya se cobró"
          testId="panel-cobranza"
          scope={scope.periodo}
          info={METRIC_HELP.cobranza}
        >
          <Meter
            testId="medidor-cobranza"
            value={sales.collection_rate}
            label="Cobrado sobre vendido"
            caption={`${formatSolesWhole(sales.collected)} cobrados de ${formatSolesWhole(sales.sold)} vendidos`}
          />
        </Panel>

        <Panel
          title="Origen de lo vendido"
          description="Oficina frente a WhatsApp"
          testId="panel-origen"
          scope={scope.periodo}
        >
          {originSegments.length === 0 ? (
            <PanelEmpty />
          ) : (
            <>
              <StackedBar
                segments={originSegments}
                format={formatSolesWhole}
                legend={false}
              />
              <ul className="mt-5 grid grid-cols-2 gap-3">
                {sales.by_origin.map((o) => (
                  <li key={o.key} className="bg-muted/40 rounded-lg p-3">
                    <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                      <span
                        aria-hidden
                        className={`size-2.5 rounded-sm ${ORIGIN_COLORS[o.key] ?? "bg-viz-4"}`}
                      />
                      {RESTORATION_ORIGIN_LABELS[o.key as RestorationOrigin] ??
                        o.key}
                    </p>
                    <p className="text-heading text-lg font-semibold">
                      {formatSolesWhole(o.sold)}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {o.orders} guías · ticket {formatSolesWhole(o.ticket)}
                    </p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel
          title="Cobrado por método"
          description="Neto de reembolsos, con la cantidad de pagos"
          testId="panel-metodos"
          scope={scope.periodo}
          info={METRIC_HELP.cobradoPorMetodo}
        >
          {sales.by_method.length === 0 ? (
            <PanelEmpty />
          ) : (
            <BarList
              items={withCountHint(sales.by_method, "pago", "pagos")}
              format={formatSolesWhole}
            />
          )}
        </Panel>
        <Panel
          title="Servicios más vendidos"
          description="Si una pieza lleva varios, el monto se reparte en partes iguales"
          testId="panel-servicios"
          scope={scope.periodo}
          info={METRIC_HELP.serviciosMasVendidos}
        >
          {sales.by_service.length === 0 ? (
            <PanelEmpty />
          ) : (
            <BarList
              items={withCountHint(
                topWithOthers(sales.by_service, 8),
                "pieza",
                "piezas",
              )}
              format={formatSolesWhole}
            />
          )}
        </Panel>
        <Panel
          title="Materiales más vendidos"
          testId="panel-materiales"
          scope={scope.periodo}
          info={METRIC_HELP.materialesMasVendidos}
        >
          {sales.by_material.length === 0 ? (
            <PanelEmpty />
          ) : (
            <BarList
              items={withCountHint(
                topWithOthers(sales.by_material, 8),
                "pieza",
                "piezas",
              )}
              format={formatSolesWhole}
            />
          )}
        </Panel>
      </div>

      {canMargins && sales.margin ? (
        <Panel
          title="Margen de lo vendido"
          description="Precio de venta menos el costo de servicio, solo de las piezas con costo registrado"
          testId="panel-margen"
          scope={scope.periodo}
          info={METRIC_HELP.margen}
        >
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              ["Margen", formatSolesWhole(sales.margin.margin)],
              ["Sobre lo vendido", formatSolesWhole(sales.margin.base)],
              ["Costo de servicio", formatSolesWhole(sales.margin.cost)],
              [
                "Margen %",
                formatPercent(
                  sales.margin.base > 0
                    ? (sales.margin.margin / sales.margin.base) * 100
                    : null,
                  0,
                ),
              ],
            ].map(([term, value]) => (
              <div key={term}>
                <dt className="text-muted-foreground text-xs">{term}</dt>
                <dd className="text-heading text-xl font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
          {sales.margin.pieces_without_cost > 0 ? (
            <p className="text-muted-foreground mt-3 text-xs">
              {sales.margin.pieces_without_cost} piezas vendidas no tienen costo
              de servicio y no se incluyen.
            </p>
          ) : null}
        </Panel>
      ) : null}
    </>
  );
}
