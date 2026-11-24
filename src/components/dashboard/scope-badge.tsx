import {
  CalendarCheck,
  CalendarRange,
  History,
  type LucideIcon,
} from "lucide-react";

import {
  scopeText,
  SCOPE_NAMES,
  type DashboardScope,
  type DashboardScopeKind,
} from "@/domain/dashboard-scope";
import { cn } from "@/lib/utils";

/**
 * Colores de cada alcance. Misma receta que `TONE_STYLES` (texto 950 sobre fondo 50, y a la
 * inversa en oscuro) para cumplir AA; además cada uno lleva su icono y su texto, así que
 * el color nunca es lo único que lo distingue. «Hoy» va en ámbar para que resalte: es lo
 * único que no se mueve con el periodo.
 */
const SCOPE_STYLES: Record<
  DashboardScopeKind,
  { icon: LucideIcon; className: string }
> = {
  periodo: {
    icon: CalendarRange,
    className:
      "border-sky-200 bg-sky-50 text-sky-950 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-50",
  },
  hoy: {
    icon: CalendarCheck,
    className:
      "border-amber-300 bg-amber-100 text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-50",
  },
  cohorte: {
    icon: History,
    className:
      "border-violet-200 bg-violet-50 text-violet-950 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-50",
  },
};

/**
 * Etiqueta que dice qué tiempo toma un gráfico o una cifra: el rango del periodo (con
 * «hasta hoy» si llega a hoy), «Al día de hoy» o el rango «con su estado actual».
 * `compact` quita el matiz largo del alcance «hoy» (para las tarjetas angostas).
 */
export function ScopeBadge({
  scope,
  compact = false,
  className,
}: {
  scope: DashboardScope;
  compact?: boolean;
  className?: string;
}) {
  const { icon: Icon, className: tone } = SCOPE_STYLES[scope.kind];
  const text = scopeText(scope);
  const detail = compact && scope.kind === "hoy" ? undefined : text.detail;
  return (
    <span
      data-slot="scope-badge"
      data-testid="scope"
      data-scope={scope.kind}
      title={text.description}
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs leading-tight font-medium",
        tone,
        className,
      )}
    >
      <Icon aria-hidden className="size-3 shrink-0" />
      <span className="sr-only">{SCOPE_NAMES[scope.kind]}: </span>
      <span>
        {text.label}
        {detail ? (
          <>
            <span aria-hidden> · </span>
            <span className="sr-only">, </span>
            <span className={scope.kind === "hoy" ? "font-normal" : undefined}>
              {detail}
            </span>
          </>
        ) : null}
      </span>
    </span>
  );
}

/** Una o varias etiquetas de alcance (una tabla puede mezclar periodo y hoy). */
export function ScopeBadges({
  scope,
  compact,
  className,
}: {
  scope: DashboardScope | readonly DashboardScope[];
  compact?: boolean;
  className?: string;
}) {
  const scopes = Array.isArray(scope)
    ? (scope as readonly DashboardScope[])
    : [scope as DashboardScope];
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1", className)}>
      {scopes.map((s) => (
        <ScopeBadge key={s.kind} scope={s} compact={compact} />
      ))}
    </span>
  );
}

const LEGEND: { kind: DashboardScopeKind; text: string }[] = [
  { kind: "periodo", text: "Datos con fecha dentro del periodo" },
  {
    kind: "cohorte",
    text: "Lo registrado en el periodo, con su estado de hoy",
  },
  { kind: "hoy", text: "Foto de hoy: no cambia con el periodo" },
];

/** Qué significa cada etiqueta, para quien las ve por primera vez. */
export function ScopeLegend({ className }: { className?: string }) {
  return (
    <ul
      aria-label="Qué significa cada etiqueta de tiempo"
      data-testid="rango-leyenda"
      className={cn(
        "text-muted-foreground flex flex-wrap gap-x-4 gap-y-1.5 text-xs",
        className,
      )}
    >
      {LEGEND.map(({ kind, text }) => {
        const { icon: Icon, className: tone } = SCOPE_STYLES[kind];
        return (
          <li key={kind} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className={cn(
                "inline-flex size-5 items-center justify-center rounded-md border",
                tone,
              )}
            >
              <Icon className="size-3" />
            </span>
            <span>
              <span className="text-foreground font-medium">
                {SCOPE_NAMES[kind]}
              </span>
              {": "}
              {text}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
