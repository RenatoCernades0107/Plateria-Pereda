import { Banknote, CircleDollarSign, Receipt, Wallet } from "lucide-react";

import { StackedBar, BarList, Meter } from "@/components/dashboard/bars";
import { KpiTile } from "@/components/dashboard/kpi";
import { KpiGrid, Panel, PanelEmpty } from "@/components/dashboard/panel";
import { TimeSeriesChart } from "@/components/dashboard/time-series-chart";
import {
  seriesPoints,
  sparkValues,
  topWithOthers,
} from "@/domain/dashboard-charts";
import {
  computeDelta,
  formatPercent,
  formatSolesWhole,
} from "@/domain/dashboard-format";
import {
  BUCKET_LABELS,
  bucketFor,
  type DashboardRange,
} from "@/domain/dashboard-range";
import { PAYMENT_TYPE_LABELS, type PaymentType } from "@/domain/money";
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
  canMargins,
}: {
  range: DashboardRange;
  canMargins: boolean;
}) {
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
  const paymentSegments = sales.by_payment_type
    .filter((p) => p.value > 0)
    .map((p, index) => ({
      key: p.key,
      label: PAYMENT_TYPE_LABELS[p.key as PaymentType] ?? p.key,
      value: p.value,
      color:
        [
          "bg-viz-seq-700",
          "bg-viz-seq-500",
          "bg-viz-seq-300",
          "bg-viz-seq-200",
        ][index] ?? "bg-viz-seq-200",
    }));

  return (
    <>
      <KpiGrid>
        <KpiTile
          testId="kpi-vendido"
          icon={CircleDollarSign}
          label="Vendido"
          value={formatSolesWhole(sales.sold)}
          delta={computeDelta(current.sold, previous.sold)}
          spark={sparkValues(current.series, "vendido")}
          hint="Piezas aprobadas en el periodo"
        />
        <KpiTile
          testId="kpi-cobrado"
          icon={Wallet}
          label="Cobrado"
          value={formatSolesWhole(sales.collected)}
          delta={computeDelta(current.collected, previous.collected)}
          spark={sparkValues(current.series, "cobrado")}
          hint="Pagos menos reembolsos"
        />
        <KpiTile
          testId="kpi-ticket"
          icon={Receipt}
          label="Ticket promedio"
          value={formatSolesWhole(current.ticket)}
          delta={computeDelta(current.ticket, previous.ticket)}
          hint={`${current.sold_orders} guías · ${current.sold_pieces} piezas`}
        />
        {canMargins && sales.margin ? (
          <KpiTile
            testId="kpi-margen"
            icon={Banknote}
            label="Margen estimado"
            value={formatSolesWhole(sales.margin.margin)}
            hint={
              sales.margin.pieces_without_cost > 0
                ? `${sales.margin.pieces_without_cost} piezas sin costo no cuentan`
                : `Sobre ${formatSolesWhole(sales.margin.base)} vendidos`
            }
          />
        ) : (
          <KpiTile
            testId="kpi-saldo"
            icon={Banknote}
            label="Saldo por cobrar hoy"
            value={formatSolesWhole(current.balance_due)}
            hint="Lo aprobado que aún no se cobra"
          />
        )}
      </KpiGrid>

      <Panel
        title="Vendido y cobrado"
        description={`Vendido por fecha de aprobación, cobrado por fecha de pago · ${BUCKET_LABELS[bucket]}`}
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

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel
          title="Cobranza"
          description="Cuánto de lo vendido ya se cobró"
          testId="panel-cobranza"
        >
          <Meter
            testId="medidor-cobranza"
            value={sales.collection_rate}
            label="Cobrado sobre vendido"
            caption={`${formatSolesWhole(sales.collected)} cobrados de ${formatSolesWhole(sales.sold)} vendidos`}
          />
          {paymentSegments.length > 0 ? (
            <div className="mt-6">
              <p className="text-muted-foreground mb-3 text-xs font-medium">
                Vendido según tipo de pago
              </p>
              <StackedBar
                segments={paymentSegments}
                format={formatSolesWhole}
              />
            </div>
          ) : null}
        </Panel>

        <Panel
          title="Origen de lo vendido"
          description="Oficina frente a WhatsApp"
          testId="panel-origen"
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
          description="Neto de reembolsos"
          testId="panel-metodos"
        >
          {sales.by_method.length === 0 ? (
            <PanelEmpty />
          ) : (
            <BarList items={sales.by_method} format={formatSolesWhole} />
          )}
        </Panel>
        <Panel
          title="Servicios más vendidos"
          description="Si una pieza lleva varios, se reparte en partes iguales"
          testId="panel-servicios"
        >
          {sales.by_service.length === 0 ? (
            <PanelEmpty />
          ) : (
            <BarList
              items={topWithOthers(sales.by_service, 8)}
              format={formatSolesWhole}
            />
          )}
        </Panel>
        <Panel title="Materiales más vendidos" testId="panel-materiales">
          {sales.by_material.length === 0 ? (
            <PanelEmpty />
          ) : (
            <BarList
              items={topWithOthers(sales.by_material, 8)}
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
