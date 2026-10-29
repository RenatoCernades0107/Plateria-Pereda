"use client";

import { Table2, BarChart3 } from "lucide-react";
import { useState } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import {
  formatAxisCompact,
  formatCount,
  formatSolesWhole,
} from "@/domain/dashboard-format";
import { cn } from "@/lib/utils";

export type SeriesDef = {
  key: string;
  label: string;
  /** Color de la marca de la serie: `var(--viz-1)`… (el texto nunca lo lleva). */
  color: string;
  kind: "area" | "line" | "bar";
};

export type SeriesPoint = {
  label: string;
  longLabel: string;
  [key: string]: number | string;
};

type ValueKind = "money" | "count";

const formatters: Record<ValueKind, (n: number) => string> = {
  money: formatSolesWhole,
  count: formatCount,
};

type TooltipProps = {
  active?: boolean;
  payload?: {
    dataKey?: string | number;
    value?: unknown;
    payload?: SeriesPoint;
  }[];
  series: SeriesDef[];
  valueKind: ValueKind;
};

/** Un solo cuadro con todas las series de esa fecha: primero el valor, luego el nombre. */
function SeriesTooltip({ active, payload, series, valueKind }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  return (
    <div
      className="bg-popover text-popover-foreground min-w-40 rounded-lg border px-3 py-2 text-xs shadow-lg"
      data-testid="grafico-tooltip"
    >
      <p className="text-muted-foreground mb-1.5 font-medium">
        {point?.longLabel}
      </p>
      <ul className="space-y-1">
        {series.map((def) => {
          const entry = payload.find((item) => item.dataKey === def.key);
          if (!entry) return null;
          return (
            <li key={def.key} className="flex items-center gap-2">
              <span
                aria-hidden
                className="h-0.5 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: def.color }}
              />
              <span className="text-heading order-last ml-auto text-sm font-semibold tabular-nums">
                {formatters[valueKind](Number(entry.value) || 0)}
              </span>
              <span className="text-muted-foreground">{def.label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Serie en el tiempo (áreas, líneas o columnas) con cuadrícula suave, tooltip único,
 * leyenda cuando hay dos o más series y la opción de verla como tabla.
 */
export function TimeSeriesChart({
  data,
  series,
  valueKind,
  ariaLabel,
  className,
  testId,
}: {
  data: SeriesPoint[];
  series: SeriesDef[];
  valueKind: ValueKind;
  ariaLabel: string;
  className?: string;
  testId?: string;
}) {
  const [asTable, setAsTable] = useState(false);
  const config = Object.fromEntries(
    series.map((def) => [def.key, { label: def.label, color: def.color }]),
  ) satisfies ChartConfig;
  const hasBars = series.some((def) => def.kind === "bar");
  const format = formatters[valueKind];

  return (
    <div data-testid={testId}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        {series.length > 1 ? (
          <ul
            className="flex flex-wrap items-center gap-x-4 gap-y-1"
            aria-label="Series"
          >
            {series.map((def) => (
              <li
                key={def.key}
                className="text-muted-foreground flex items-center gap-1.5 text-xs"
              >
                <span
                  aria-hidden
                  className={cn(
                    "shrink-0 rounded-full",
                    def.kind === "bar" ? "size-2.5 rounded-sm" : "h-0.5 w-4",
                  )}
                  style={{ backgroundColor: def.color }}
                />
                {def.label}
              </li>
            ))}
          </ul>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={() => setAsTable((value) => !value)}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs outline-none focus-visible:ring-2"
          aria-pressed={asTable}
          data-testid="ver-como-tabla"
        >
          {asTable ? (
            <BarChart3 aria-hidden className="size-3.5" />
          ) : (
            <Table2 aria-hidden className="size-3.5" />
          )}
          {asTable ? "Ver gráfico" : "Ver como tabla"}
        </button>
      </div>

      {asTable ? (
        <div className="max-h-72 overflow-auto rounded-lg border">
          <table className="w-full text-sm" data-testid="grafico-tabla">
            <thead className="bg-muted/50 sticky top-0 text-left text-xs">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  Periodo
                </th>
                {series.map((def) => (
                  <th
                    key={def.key}
                    scope="col"
                    className="px-3 py-2 text-right font-medium"
                  >
                    {def.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((point) => (
                <tr key={point.longLabel + point.label} className="border-t">
                  <th
                    scope="row"
                    className="text-muted-foreground px-3 py-1.5 text-left font-normal"
                  >
                    {point.longLabel}
                  </th>
                  {series.map((def) => (
                    <td
                      key={def.key}
                      className="px-3 py-1.5 text-right tabular-nums"
                    >
                      {format(Number(point[def.key]) || 0)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div role="img" aria-label={ariaLabel}>
          <ChartContainer
            config={config}
            className={cn("aspect-auto h-64 w-full", className)}
          >
            <ComposedChart
              data={data}
              margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
            >
              <CartesianGrid
                vertical={false}
                stroke="var(--viz-grid)"
                strokeWidth={1}
              />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={{ stroke: "var(--viz-grid)" }}
                tickMargin={8}
                minTickGap={24}
                interval="preserveStartEnd"
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={58}
                tickMargin={4}
                allowDecimals={false}
                tickFormatter={(value: number) => formatAxisCompact(value)}
              />
              <Tooltip
                cursor={
                  hasBars
                    ? { fill: "var(--viz-track)", opacity: 0.6 }
                    : { stroke: "var(--viz-grid)", strokeWidth: 1 }
                }
                content={(props) => (
                  <SeriesTooltip
                    active={props.active}
                    payload={
                      props.payload as unknown as TooltipProps["payload"]
                    }
                    series={series}
                    valueKind={valueKind}
                  />
                )}
              />
              {series.map((def) => {
                if (def.kind === "bar") {
                  return (
                    <Bar
                      key={def.key}
                      dataKey={def.key}
                      fill={def.color}
                      maxBarSize={20}
                      radius={[4, 4, 0, 0]}
                    />
                  );
                }
                if (def.kind === "area") {
                  return (
                    <Area
                      key={def.key}
                      type="monotone"
                      dataKey={def.key}
                      stroke={def.color}
                      strokeWidth={2}
                      fill={def.color}
                      fillOpacity={0.1}
                      dot={false}
                      activeDot={{
                        r: 4,
                        fill: def.color,
                        stroke: "var(--card)",
                        strokeWidth: 2,
                      }}
                    />
                  );
                }
                return (
                  <Line
                    key={def.key}
                    type="monotone"
                    dataKey={def.key}
                    stroke={def.color}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{
                      r: 4,
                      fill: def.color,
                      stroke: "var(--card)",
                      strokeWidth: 2,
                    }}
                  />
                );
              })}
            </ComposedChart>
          </ChartContainer>
        </div>
      )}
    </div>
  );
}
