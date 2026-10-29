import { Minus, TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Sparkline } from "@/components/dashboard/sparkline";
import { ToneBadge } from "@/components/tone-badge";
import { deltaText, deltaTone, type Delta } from "@/domain/dashboard-format";
import type { BadgeTone } from "@/domain/status-progress";
import { cn } from "@/lib/utils";

const TONE_BY_DELTA = {
  good: "success",
  bad: "critical",
  neutral: "neutral",
} as const satisfies Record<string, BadgeTone>;

/**
 * Variación contra el periodo anterior. Lleva icono y texto, nunca solo color. Si subir
 * es malo (p. ej. los días de cumplimiento), `upIsGood={false}` invierte el tono.
 */
export function DeltaBadge({
  delta,
  upIsGood = true,
  className,
}: {
  delta: Delta;
  upIsGood?: boolean;
  className?: string;
}) {
  const text = deltaText(delta);
  if (!text) return null;
  const tone = deltaTone(delta, upIsGood);
  const Icon =
    delta.kind === "up" || delta.kind === "new"
      ? TrendingUp
      : delta.kind === "down"
        ? TrendingDown
        : Minus;
  return (
    <ToneBadge
      tone={TONE_BY_DELTA[tone]}
      indicator={<Icon aria-hidden className="size-3" />}
      className={cn("font-medium tabular-nums", className)}
      data-testid="delta"
      aria-label={`${text} respecto del periodo anterior`}
    >
      {text}
    </ToneBadge>
  );
}

/** Tarjeta de un indicador: etiqueta, valor, variación y (si hay) su tendencia. */
export function KpiTile({
  label,
  value,
  icon: Icon,
  delta,
  upIsGood = true,
  spark,
  hint,
  href,
  testId,
}: {
  label: string;
  value: ReactNode;
  icon?: LucideIcon;
  delta?: Delta;
  upIsGood?: boolean;
  spark?: number[];
  hint?: ReactNode;
  /** Si se da, toda la tarjeta lleva al listado relacionado. */
  href?: string;
  testId?: string;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground flex items-center gap-1.5 text-sm font-medium">
          {Icon ? <Icon aria-hidden className="text-primary size-4" /> : null}
          {label}
        </span>
        {delta ? <DeltaBadge delta={delta} upIsGood={upIsGood} /> : null}
      </div>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
        <span
          className="text-heading text-2xl font-semibold tracking-tight whitespace-nowrap sm:text-[1.7rem]"
          data-testid={testId ? `${testId}-valor` : undefined}
        >
          {value}
        </span>
        {spark ? <Sparkline values={spark} className="w-20" /> : null}
      </div>
      {hint ? (
        <p className="text-muted-foreground mt-1.5 text-xs">{hint}</p>
      ) : null}
    </>
  );
  const className =
    "bg-card block rounded-xl border p-4 shadow-xs transition-colors";
  return href ? (
    <Link
      href={href}
      className={cn(className, "hover:border-primary/50")}
      data-testid={testId}
    >
      {body}
    </Link>
  ) : (
    <div className={className} data-testid={testId}>
      {body}
    </div>
  );
}

/**
 * La cifra con la que arranca el dashboard: >= 48 px, una por vista. Fondo cálido de la
 * marca y la tendencia grande a la derecha.
 */
export function HeroStat({
  label,
  value,
  delta,
  previousLabel,
  spark,
  children,
  testId,
}: {
  label: string;
  value: ReactNode;
  delta?: Delta;
  previousLabel?: string;
  spark?: number[];
  children?: ReactNode;
  testId?: string;
}) {
  return (
    <section
      aria-label={label}
      data-testid={testId}
      className="bg-guide relative overflow-hidden rounded-2xl border p-5 shadow-xs sm:p-7"
    >
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="min-w-0">
          <p className="text-muted-foreground text-sm font-medium">{label}</p>
          <p
            className="text-heading mt-1 text-5xl font-semibold tracking-tight sm:text-6xl"
            data-testid={testId ? `${testId}-valor` : undefined}
          >
            {value}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {delta ? <DeltaBadge delta={delta} /> : null}
            {previousLabel ? (
              <span className="text-muted-foreground text-xs">
                {previousLabel}
              </span>
            ) : null}
          </div>
        </div>
        {spark ? (
          <Sparkline values={spark} className="h-16 w-full max-w-60 sm:w-60" />
        ) : null}
      </div>
      {children ? <div className="mt-5 border-t pt-4">{children}</div> : null}
    </section>
  );
}
