import { Repeat, UserPlus, Users, UsersRound } from "lucide-react";
import Link from "next/link";

import { BarList, StackedBar } from "@/components/dashboard/bars";
import { KpiTile } from "@/components/dashboard/kpi";
import { KpiGrid, Panel, PanelEmpty } from "@/components/dashboard/panel";
import { TimeSeriesChart } from "@/components/dashboard/time-series-chart";
import { regionName, seriesPoints } from "@/domain/dashboard-charts";
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
import { dashboardClients } from "@/server/dashboard-metrics";

const KIND_LABELS: Record<string, string> = {
  persona: "Personas",
  empresa: "Empresas",
};
const KIND_COLORS: Record<string, string> = {
  persona: "bg-viz-1",
  empresa: "bg-viz-2",
};

export async function ClientsArea({ range }: { range: DashboardRange }) {
  const clients = await dashboardClients(range);
  const bucket = bucketFor(range);
  const points = seriesPoints(clients.series, bucket);
  const kindSegments = clients.new_by_kind
    .filter((k) => k.value > 0)
    .map((k) => ({
      key: k.key,
      label: KIND_LABELS[k.key] ?? k.key,
      value: k.value,
      color: KIND_COLORS[k.key] ?? "bg-viz-3",
    }));

  return (
    <>
      <KpiGrid>
        <KpiTile
          testId="kpi-clientes-activos"
          icon={Users}
          label="Clientes registrados"
          value={formatCount(clients.total_active)}
          hint="Activos hoy"
        />
        <KpiTile
          testId="kpi-clientes-nuevos"
          icon={UserPlus}
          label="Clientes nuevos"
          value={formatCount(clients.new_clients)}
          hint="Dados de alta en el periodo"
        />
        <KpiTile
          testId="kpi-clientes-con-guias"
          icon={UsersRound}
          label="Clientes con guías"
          value={formatCount(clients.active_in_range)}
          hint="Registraron una guía en el periodo"
        />
        <KpiTile
          testId="kpi-recompra"
          icon={Repeat}
          label="Recompra"
          value={formatPercent(clients.repeat_rate, 0)}
          hint={`${clients.returning} ya habían traído piezas antes`}
        />
      </KpiGrid>

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel
          title="Clientes nuevos"
          description={`Altas ${BUCKET_LABELS[bucket]}`}
          className="lg:col-span-2"
          testId="grafico-clientes-nuevos"
        >
          <TimeSeriesChart
            data={points}
            valueKind="count"
            ariaLabel={`Clientes nuevos ${BUCKET_LABELS[bucket]}`}
            series={[
              {
                key: "nuevos",
                label: "Clientes nuevos",
                color: "var(--viz-1)",
                kind: "bar",
              },
            ]}
          />
        </Panel>
        <Panel
          title="Quiénes son los nuevos"
          description="Personas y empresas"
          testId="panel-tipo-cliente"
        >
          {kindSegments.length === 0 ? (
            <PanelEmpty />
          ) : (
            <StackedBar segments={kindSegments} />
          )}
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel
          title="Mejores clientes"
          description="Por monto aprobado en el periodo"
          testId="panel-mejores-clientes"
        >
          {clients.top_clients.length === 0 ? (
            <PanelEmpty />
          ) : (
            <BarList
              format={formatSolesWhole}
              items={clients.top_clients.map((c) => ({
                key: c.id,
                label: c.name,
                hint: `${c.orders} ${c.orders === 1 ? "guía" : "guías"} · ${c.pieces} ${c.pieces === 1 ? "pieza" : "piezas"}`,
                value: c.sold,
                href: `/clientes/${c.id}`,
              }))}
            />
          )}
        </Panel>
        <Panel
          title="Ventas por región"
          description="Según la región del cliente"
          testId="panel-regiones"
        >
          {clients.regions.length === 0 ? (
            <PanelEmpty />
          ) : (
            <BarList
              format={formatSolesWhole}
              items={clients.regions.map((r) => ({
                key: r.region,
                label: regionName(r.region),
                hint: `${r.clients} ${r.clients === 1 ? "cliente" : "clientes"} · ${r.orders} ${r.orders === 1 ? "guía" : "guías"}`,
                value: r.sold,
              }))}
            />
          )}
        </Panel>
      </div>

      <Panel
        title="Clientes con saldo por cobrar"
        description="Foto de hoy: lo aprobado menos lo pagado"
        testId="panel-deudores"
      >
        {clients.top_debtors.length === 0 ? (
          <PanelEmpty>Nadie tiene saldo pendiente.</PanelEmpty>
        ) : (
          <ul className="divide-y">
            {clients.top_debtors.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between gap-3 py-2.5 text-sm"
              >
                <Link
                  href={`/clientes/${d.id}`}
                  className="hover:text-primary min-w-0 truncate underline-offset-2 hover:underline"
                >
                  {d.name}
                  <span className="text-muted-foreground ml-2 text-xs">
                    {d.orders} {d.orders === 1 ? "guía" : "guías"}
                  </span>
                </Link>
                <span className="text-heading font-semibold tabular-nums">
                  {formatSolesWhole(d.due)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
