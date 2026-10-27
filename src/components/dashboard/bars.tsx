import Link from "next/link";
import type { ReactNode } from "react";

import { barWidth, type FunnelStep } from "@/domain/dashboard-charts";
import { formatPercent } from "@/domain/dashboard-format";
import { cn } from "@/lib/utils";

export type BarItem = {
  key?: string;
  label: ReactNode;
  value: number;
  /** Texto bajo la etiqueta (p. ej. «3 guías»). */
  hint?: ReactNode;
  href?: string;
};

/**
 * Barras horizontales en HTML: etiqueta, barra de hasta 10 px con el extremo
 * redondeado y el valor en la punta. Una sola escala (la del mayor) y un solo color:
 * la magnitud se lee por el largo, así que no hace falta leyenda. Sin JS.
 */
export function BarList({
  items,
  format,
  max,
  tone = "bg-viz-seq-500",
  testId,
}: {
  items: BarItem[];
  format: (value: number) => string;
  max?: number;
  tone?: string;
  testId?: string;
}) {
  const top = max ?? Math.max(0, ...items.map((item) => item.value));
  return (
    <div className="@container" data-testid={testId}>
      <ul className="space-y-3">
        {items.map((item, index) => {
          const label = (
            <span className="min-w-0">
              <span className="text-foreground block truncate text-sm">
                {item.label}
              </span>
              {item.hint ? (
                <span className="text-muted-foreground block truncate text-xs">
                  {item.hint}
                </span>
              ) : null}
            </span>
          );
          return (
            <li
              key={item.key ?? index}
              className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5 @md:grid-cols-[minmax(8rem,13rem)_1fr_5rem]"
            >
              {item.href ? (
                <Link
                  href={item.href}
                  className="hover:text-primary min-w-0 underline-offset-2 hover:underline"
                >
                  {label}
                </Link>
              ) : (
                label
              )}
              <span
                className="bg-viz-track order-last col-span-2 h-2.5 overflow-hidden rounded-full @md:order-none @md:col-span-1"
                aria-hidden
              >
                <span
                  className={cn("block h-full rounded-r-[4px]", tone)}
                  style={{ width: `${barWidth(item.value, top)}%` }}
                />
              </span>
              <span className="text-heading text-right text-sm font-semibold tabular-nums">
                {format(item.value)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export type Segment = {
  key: string;
  label: string;
  value: number;
  /** Clase de fondo del segmento. */
  color: string;
};

/**
 * Barra apilada de una sola fila (partes de un todo) con 2 px de aire entre segmentos y
 * leyenda con los números: el significado no depende del color.
 */
export function StackedBar({
  segments,
  format = (n) => String(n),
  legend = true,
  testId,
}: {
  segments: Segment[];
  format?: (value: number) => string;
  /** Sin leyenda cuando otro bloque ya nombra cada segmento. */
  legend?: boolean;
  testId?: string;
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  return (
    <div className="@container" data-testid={testId}>
      <div
        className="flex h-3.5 gap-0.5 overflow-hidden rounded-full"
        role="img"
        aria-label={segments
          .map((s) => `${s.label}: ${format(s.value)}`)
          .join(", ")}
      >
        {segments.map((s) => (
          <span
            key={s.key}
            className={cn(
              "h-full min-w-1 first:rounded-l-full last:rounded-r-full",
              s.color,
            )}
            style={{ flexGrow: s.value, flexBasis: 0 }}
          />
        ))}
      </div>
      {legend ? (
        <ul className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 @lg:grid-cols-2">
          {segments.map((s) => (
            <li key={s.key} className="flex items-center gap-2 text-sm">
              <span
                aria-hidden
                className={cn("size-2.5 shrink-0 rounded-sm", s.color)}
              />
              <span className="text-foreground min-w-0 flex-1 truncate">
                {s.label}
              </span>
              <span className="text-heading font-semibold tabular-nums">
                {format(s.value)}
              </span>
              <span className="text-muted-foreground w-12 text-right text-xs tabular-nums">
                {total > 0 ? formatPercent((s.value / total) * 100, 0) : "—"}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

const FUNNEL_TONES = ["bg-viz-seq-300", "bg-viz-seq-500", "bg-viz-seq-700"];

/** Embudo de piezas: cada paso es una barra proporcional a lo registrado. */
export function Funnel({
  steps,
  losses,
  testId,
}: {
  steps: FunnelStep[];
  losses?: { key: string; label: string; value: number }[];
  testId?: string;
}) {
  const top = steps[0]?.value ?? 0;
  return (
    <div data-testid={testId}>
      <ol className="space-y-3">
        {steps.map((step, index) => (
          <li key={step.key}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
              <span className="text-foreground">{step.label}</span>
              <span className="text-heading font-semibold tabular-nums">
                {step.value}
                {index > 0 ? (
                  <span className="text-muted-foreground ml-2 text-xs font-normal">
                    {formatPercent(step.pct, 0)}
                  </span>
                ) : null}
              </span>
            </div>
            <div
              className="bg-viz-track h-5 overflow-hidden rounded-md"
              aria-hidden
            >
              <div
                className={cn(
                  "h-full rounded-r-[4px]",
                  FUNNEL_TONES[index] ?? FUNNEL_TONES[2],
                )}
                style={{ width: `${barWidth(step.value, top)}%` }}
              />
            </div>
          </li>
        ))}
      </ol>
      {losses && losses.some((l) => l.value > 0) ? (
        <ul className="mt-4 flex flex-wrap gap-2">
          {losses
            .filter((l) => l.value > 0)
            .map((l) => (
              <li
                key={l.key}
                className="bg-muted/60 text-foreground rounded-full border px-2.5 py-1 text-xs"
              >
                {l.label}:{" "}
                <span className="font-semibold tabular-nums">{l.value}</span>
              </li>
            ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Medidor de una proporción (p. ej. cobrado sobre vendido): pista clara del mismo tono. */
export function Meter({
  value,
  label,
  caption,
  testId,
}: {
  /** 0–100. */
  value: number | null;
  label: string;
  caption?: ReactNode;
  testId?: string;
}) {
  const pct = value === null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div data-testid={testId}>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-foreground text-sm">{label}</span>
        <span className="text-heading text-lg font-semibold tabular-nums">
          {formatPercent(value, 0)}
        </span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        className="bg-viz-track h-3 overflow-hidden rounded-full"
      >
        <div
          className="bg-viz-seq-500 h-full rounded-r-[4px]"
          style={{ width: `${pct}%` }}
        />
      </div>
      {caption ? (
        <p className="text-muted-foreground mt-1.5 text-xs">{caption}</p>
      ) : null}
    </div>
  );
}
