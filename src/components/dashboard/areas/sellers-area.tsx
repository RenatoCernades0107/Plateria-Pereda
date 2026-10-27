import { CircleDollarSign, Percent, Trophy, Users } from "lucide-react";

import { BarList } from "@/components/dashboard/bars";
import { KpiTile } from "@/components/dashboard/kpi";
import { KpiGrid, Panel, PanelEmpty } from "@/components/dashboard/panel";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatCount,
  formatPercent,
  formatSolesWhole,
} from "@/domain/dashboard-format";
import type { DashboardRange } from "@/domain/dashboard-range";
import { dashboardSellers } from "@/server/dashboard-metrics";

/**
 * Vendedores (el que creó la guía). El admin ve el ranking de todos; ventas solo su propia
 * fila, como «Mi desempeño» (D78): la BD ya devuelve únicamente lo que corresponde.
 */
export async function SellersArea({ range }: { range: DashboardRange }) {
  const data = await dashboardSellers(range);
  const own = data.scope === "propio";
  const rows = data.sellers;
  const top = rows[0];

  return (
    <>
      <KpiGrid>
        {own ? (
          <>
            <KpiTile
              testId="kpi-vendido"
              icon={CircleDollarSign}
              label="Vendido por mí"
              value={formatSolesWhole(top?.sold ?? 0)}
              hint="Piezas aprobadas de mis guías"
            />
            <KpiTile
              testId="kpi-cobrado"
              icon={Users}
              label="Cobrado de mis guías"
              value={formatSolesWhole(top?.collected ?? 0)}
            />
            <KpiTile
              testId="kpi-guias"
              icon={Users}
              label="Guías registradas"
              value={formatCount(top?.orders ?? 0)}
              hint={`Ticket ${formatSolesWhole(top?.ticket ?? 0)}`}
            />
            <KpiTile
              testId="kpi-aprobacion"
              icon={Percent}
              label="Piezas aprobadas"
              value={formatPercent(top?.approval_rate ?? null, 0)}
              hint={`${top?.approved ?? 0} de ${top?.pieces ?? 0} registradas`}
            />
          </>
        ) : (
          <>
            <KpiTile
              testId="kpi-vendedores"
              icon={Users}
              label="Vendedores con actividad"
              value={formatCount(rows.length)}
            />
            <KpiTile
              testId="kpi-mejor-vendedor"
              icon={Trophy}
              label="Mejor del periodo"
              value={top && top.sold > 0 ? top.name : "—"}
              hint={
                top && top.sold > 0
                  ? `${formatSolesWhole(top.sold)} vendidos`
                  : "Sin ventas en el periodo"
              }
            />
            <KpiTile
              testId="kpi-vendido"
              icon={CircleDollarSign}
              label="Vendido por el equipo"
              value={formatSolesWhole(rows.reduce((sum, r) => sum + r.sold, 0))}
            />
            <KpiTile
              testId="kpi-cobrado"
              icon={CircleDollarSign}
              label="Cobrado por el equipo"
              value={formatSolesWhole(
                rows.reduce((sum, r) => sum + r.collected, 0),
              )}
            />
          </>
        )}
      </KpiGrid>

      {!own ? (
        <Panel
          title="Ranking de ventas"
          description="Monto aprobado de las guías que creó cada vendedor"
          testId="panel-ranking"
        >
          {rows.length === 0 ? (
            <PanelEmpty />
          ) : (
            <BarList
              format={formatSolesWhole}
              items={rows.map((r) => ({
                key: r.id ?? r.name,
                label: r.name,
                hint: `${r.orders} ${r.orders === 1 ? "guía" : "guías"} · ticket ${formatSolesWhole(r.ticket)}`,
                value: r.sold,
              }))}
            />
          )}
        </Panel>
      ) : null}

      <Panel
        title={own ? "Mi desempeño" : "Detalle por vendedor"}
        description="Guías creadas, ventas, cobros y cotizaciones de WhatsApp"
        testId="tabla-vendedores"
      >
        {rows.length === 0 ? (
          <PanelEmpty />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendedor</TableHead>
                <TableHead className="text-right">Guías</TableHead>
                <TableHead className="text-right">Vendido</TableHead>
                <TableHead className="text-right">Cobrado</TableHead>
                <TableHead className="text-right">Ticket</TableHead>
                <TableHead className="text-right">Aprobación</TableHead>
                <TableHead className="text-right">WhatsApp</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow
                  key={r.id ?? r.name}
                  data-testid={`vendedor-${r.id ?? "ninguno"}`}
                >
                  <TableCell className="font-medium">
                    {r.name}
                    {r.is_self && !own ? (
                      <span className="text-muted-foreground ml-2 text-xs">
                        (tú)
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.orders}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatSolesWhole(r.sold)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatSolesWhole(r.collected)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatSolesWhole(r.ticket)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPercent(r.approval_rate, 0)}
                    <span className="text-muted-foreground ml-1 text-xs">
                      ({r.approved}/{r.pieces})
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.cwa_converted}/{r.cwa_created}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>
    </>
  );
}
