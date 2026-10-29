import {
  AlarmClock,
  Hammer,
  Hourglass,
  PackageCheck,
  Wallet,
} from "lucide-react";
import Link from "next/link";

import { BarList } from "@/components/dashboard/bars";
import { KpiTile } from "@/components/dashboard/kpi";
import { KpiGrid, Panel, PanelEmpty } from "@/components/dashboard/panel";
import { ToneBadge } from "@/components/tone-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { barWidth, workshopTone } from "@/domain/dashboard-charts";
import {
  formatCount,
  formatDays,
  formatSolesWhole,
} from "@/domain/dashboard-format";
import type { DashboardRange } from "@/domain/dashboard-range";
import type { DashboardWorkshopRow } from "@/domain/dashboard-schemas";
import {
  parsePieceBoardFilters,
  pieceBoardHref,
} from "@/domain/piece-board-filters";
import { dashboardWorkshops } from "@/server/dashboard-metrics";

const boardBase = parsePieceBoardFilters({});

function loadLabel(row: DashboardWorkshopRow, alertDays: number): string {
  if (row.in_workshop === 0) return "Sin piezas";
  if (row.over_alert > 0) {
    return `${row.over_alert} con ${alertDays}+ días`;
  }
  return "Al día";
}

export async function WorkshopsArea({
  range,
  canMargins,
}: {
  range: DashboardRange;
  canMargins: boolean;
}) {
  const data = await dashboardWorkshops(range);
  const rows = data.workshops;
  const withDays = rows.filter((r) => r.avg_days !== null);
  const scale = Math.max(
    1,
    ...withDays.map((r) => r.max_days ?? 0),
    ...withDays.map((r) => r.avg_days ?? 0),
  );
  const showCost = canMargins && data.total.cost !== null;

  return (
    <>
      <KpiGrid>
        <KpiTile
          testId="kpi-devueltas"
          icon={PackageCheck}
          label="Piezas devueltas"
          value={formatCount(data.total.returned)}
          hint="Volvieron del taller en el periodo"
        />
        <KpiTile
          testId="kpi-dias-promedio"
          icon={Hourglass}
          label="Días en taller (promedio)"
          value={formatDays(data.total.avg_days)}
          hint={`Mediana ${formatDays(data.total.median_days)}`}
        />
        <KpiTile
          testId="kpi-en-taller"
          icon={Hammer}
          label="En taller ahora"
          value={formatCount(data.total.in_workshop)}
          href={pieceBoardHref(boardBase, { location: "en_taller" })}
          hint="Ver las piezas"
        />
        <KpiTile
          testId="kpi-con-retraso"
          icon={AlarmClock}
          label={`Con ${data.alert_days}+ días`}
          value={formatCount(data.total.over_alert)}
          href={pieceBoardHref(boardBase, {
            location: "en_taller",
            minDays: data.alert_days,
          })}
          hint="Piezas que llevan demasiado en el taller"
        />
      </KpiGrid>

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel
          title="Días en taller por taller"
          description="La barra es el promedio; la marca vertical, la mediana"
          className="lg:col-span-2"
          testId="panel-dias-taller"
        >
          {withDays.length === 0 ? (
            <PanelEmpty>
              Ninguna pieza volvió del taller en el periodo.
            </PanelEmpty>
          ) : (
            <div className="@container">
              <ul className="space-y-4" data-testid="dias-por-taller">
                {withDays.map((row) => (
                  <li
                    key={row.id}
                    className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5 @md:grid-cols-[minmax(8rem,12rem)_1fr_7rem]"
                  >
                    <span className="text-foreground min-w-0 truncate text-sm">
                      {row.name}
                      <span className="text-muted-foreground block text-xs">
                        {row.returned} {row.returned === 1 ? "pieza" : "piezas"}
                      </span>
                    </span>
                    <span
                      className="bg-viz-track relative order-last col-span-2 h-3 rounded-full @md:order-none @md:col-span-1"
                      aria-hidden
                    >
                      <span
                        className="bg-viz-seq-500 absolute inset-y-0 left-0 rounded-l-full rounded-r-[4px]"
                        style={{
                          width: `${barWidth(row.avg_days ?? 0, scale)}%`,
                        }}
                      />
                      {row.median_days !== null ? (
                        <span
                          className="bg-heading ring-card absolute -inset-y-1 w-0.5 rounded-full ring-2"
                          style={{
                            left: `${Math.min(99, barWidth(row.median_days, scale))}%`,
                          }}
                        />
                      ) : null}
                    </span>
                    <span className="text-heading text-right text-sm font-semibold tabular-nums">
                      {formatDays(row.avg_days)}
                      <span className="text-muted-foreground block text-xs font-normal">
                        mediana {formatDays(row.median_days)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>

        <Panel
          title="¿Cuánto tardan?"
          description="Piezas devueltas según sus días en el taller"
          testId="panel-distribucion-taller"
        >
          {data.total.returned === 0 ? (
            <PanelEmpty />
          ) : (
            <BarList items={data.total.buckets} format={formatCount} />
          )}
        </Panel>
      </div>

      <Panel
        title="Detalle por taller"
        description="Devueltas, enviadas y carga de hoy"
        testId="tabla-talleres"
        action={
          showCost ? (
            <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <Wallet aria-hidden className="size-3.5" />
              Costo total de las devueltas:{" "}
              {formatSolesWhole(data.total.cost ?? 0)}
            </span>
          ) : null
        }
      >
        {rows.length === 0 ? (
          <PanelEmpty>No hay talleres con actividad.</PanelEmpty>
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Taller</TableHead>
                    <TableHead className="text-right">Enviadas</TableHead>
                    <TableHead className="text-right">Devueltas</TableHead>
                    <TableHead className="text-right">Prom. días</TableHead>
                    <TableHead className="text-right">Mediana</TableHead>
                    <TableHead className="text-right">Observadas</TableHead>
                    <TableHead className="text-right">En taller hoy</TableHead>
                    <TableHead>Carga</TableHead>
                    {showCost ? (
                      <TableHead className="text-right">Costo</TableHead>
                    ) : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id} data-testid={`taller-${row.id}`}>
                      <TableCell className="font-medium">
                        <Link
                          href={pieceBoardHref(boardBase, {
                            workshopId: row.id,
                          })}
                          className="hover:text-primary underline-offset-2 hover:underline"
                        >
                          {row.name}
                        </Link>
                        {!row.active ? (
                          <span className="text-muted-foreground ml-2 text-xs">
                            (inactivo)
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.sent}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.returned}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatDays(row.avg_days)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatDays(row.median_days)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.observed}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.in_workshop}
                      </TableCell>
                      <TableCell>
                        <ToneBadge tone={workshopTone(row, data.alert_days)}>
                          {loadLabel(row, data.alert_days)}
                        </ToneBadge>
                      </TableCell>
                      {showCost ? (
                        <TableCell className="text-right tabular-nums">
                          {row.cost !== null ? formatSolesWhole(row.cost) : "—"}
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <ul className="space-y-3 md:hidden" data-testid="talleres-tarjetas">
              {rows.map((row) => (
                <li key={row.id} className="bg-muted/30 rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={pieceBoardHref(boardBase, { workshopId: row.id })}
                      className="text-heading font-medium underline-offset-2 hover:underline"
                    >
                      {row.name}
                    </Link>
                    <ToneBadge tone={workshopTone(row, data.alert_days)}>
                      {loadLabel(row, data.alert_days)}
                    </ToneBadge>
                  </div>
                  <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    {[
                      ["Enviadas", String(row.sent)],
                      ["Devueltas", String(row.returned)],
                      ["En taller", String(row.in_workshop)],
                      ["Promedio", formatDays(row.avg_days)],
                      ["Mediana", formatDays(row.median_days)],
                      ["Observadas", String(row.observed)],
                      ...(showCost
                        ? [
                            [
                              "Costo",
                              row.cost !== null
                                ? formatSolesWhole(row.cost)
                                : "—",
                            ],
                          ]
                        : []),
                    ].map(([term, value]) => (
                      <div key={term}>
                        <dt className="text-muted-foreground">{term}</dt>
                        <dd className="text-heading font-semibold tabular-nums">
                          {value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </li>
              ))}
            </ul>
          </>
        )}
      </Panel>
    </>
  );
}
