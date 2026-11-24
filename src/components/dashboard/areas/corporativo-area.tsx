import { CircleDollarSign, FileText, Percent, ReceiptText } from "lucide-react";

import { StackedBar } from "@/components/dashboard/bars";
import { COT_STATUS_COLORS } from "@/components/dashboard/colors";
import { KpiTile } from "@/components/dashboard/kpi";
import { KpiGrid, Panel, PanelEmpty } from "@/components/dashboard/panel";
import { METRIC_HELP } from "@/domain/dashboard-help";
import { dashboardScopes } from "@/domain/dashboard-scope";
import {
  formatCount,
  formatPercent,
  formatSolesWhole,
} from "@/domain/dashboard-format";
import type { DashboardRange } from "@/domain/dashboard-range";
import { dashboardQuotes } from "@/server/dashboard-metrics";

const COT_LABELS = {
  borrador: "Borradores",
  emitida: "Emitidas",
  aceptada: "Aceptadas",
  facturada: "Facturadas",
  reembolsada: "Reembolsadas",
  rechazada: "Rechazadas",
  vencida: "Vencidas",
  anulada: "Anuladas",
} as const;

/** Pestaña «Corporativo»: las cotizaciones del cotizador (COT) del periodo. */
export async function CorporativoArea({
  range,
  today,
}: {
  range: DashboardRange;
  /** Hoy en Lima ("AAAA-MM-DD"), para las etiquetas de tiempo. */
  today: string;
}) {
  const scope = dashboardScopes(range, today);
  const { cot } = await dashboardQuotes(range);
  const cotSegments = (
    [
      "borrador",
      "emitida",
      "aceptada",
      "facturada",
      "reembolsada",
      "rechazada",
      "vencida",
      "anulada",
    ] as const
  )
    .map((key) => ({
      key,
      label: COT_LABELS[key],
      value: cot[key],
      color: COT_STATUS_COLORS[key],
    }))
    .filter((s) => s.value > 0);

  return (
    <>
      <KpiGrid>
        <KpiTile
          testId="kpi-cot"
          scope={scope.periodo}
          info={METRIC_HELP.cot}
          icon={FileText}
          label="Cotizaciones corporativas"
          value={formatCount(cot.created)}
          hint="Creadas en el periodo"
        />
        <KpiTile
          testId="kpi-cot-aceptacion"
          scope={scope.cohorte}
          info={METRIC_HELP.cot}
          icon={Percent}
          label="Aceptación"
          value={formatPercent(cot.acceptance, 0)}
          hint={
            cot.acceptance !== null
              ? "Aceptadas sobre emitidas"
              : "Sin cotizaciones emitidas"
          }
        />
        <KpiTile
          testId="kpi-cot-emitido"
          scope={scope.cohorte}
          info={METRIC_HELP.cotMontos}
          icon={ReceiptText}
          label="Monto emitido"
          value={formatSolesWhole(cot.amount)}
          hint="Sin contar borradores"
        />
        <KpiTile
          testId="kpi-cot-aceptado"
          scope={scope.cohorte}
          info={METRIC_HELP.cotMontos}
          icon={CircleDollarSign}
          label="Monto aceptado"
          value={formatSolesWhole(cot.accepted_amount)}
          hint={
            cot.amount > 0
              ? `${formatPercent((cot.accepted_amount / cot.amount) * 100, 0)} de lo emitido`
              : undefined
          }
        />
      </KpiGrid>

      <Panel
        title="Estado de las cotizaciones"
        description="De las cotizaciones corporativas creadas en el periodo"
        testId="panel-cot"
        scope={scope.cohorte}
        info={METRIC_HELP.cot}
      >
        {cotSegments.length === 0 ? (
          <PanelEmpty />
        ) : (
          <>
            <StackedBar segments={cotSegments} />
            {cot.amount > 0 ? (
              <p className="text-muted-foreground mt-4 text-xs">
                {formatSolesWhole(cot.accepted_amount)} aceptados de{" "}
                {formatSolesWhole(cot.amount)} emitidos.
              </p>
            ) : null}
          </>
        )}
      </Panel>
    </>
  );
}
