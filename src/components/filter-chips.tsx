import { Check } from "lucide-react";
import Link from "next/link";

import type { ChipTone, FilterChip } from "@/domain/filter-presets";
import { cn } from "@/lib/utils";

const TONES: Record<ChipTone, { idle: string; active: string; count: string }> =
  {
    default: {
      idle: "border-border bg-background text-foreground hover:bg-muted",
      active: "border-primary bg-primary text-primary-foreground",
      count: "bg-muted text-foreground",
    },
    // Rojo tenue: pide atención sin gritar. Activo, rojo sólido (contraste AA).
    alert: {
      idle: "border-red-200 bg-red-50 text-red-900 hover:bg-red-100 dark:border-red-900 dark:bg-red-950 dark:text-red-100 dark:hover:bg-red-900",
      active:
        "border-red-700 bg-red-700 text-white dark:border-red-600 dark:bg-red-700",
      count: "bg-red-100 text-red-900 dark:bg-red-900 dark:text-red-50",
    },
  };

/**
 * Chips de filtros de un clic (K12): enlaces con el filtro en la URL, en una franja
 * propia bajo el título, antes de la búsqueda. Cada uno muestra cuántos resultados da
 * (la carga de trabajo de un vistazo) y los que piden atención van en rojo tenue.
 */
export function FilterChips({
  chips,
  label = "Filtros rápidos",
}: {
  chips: FilterChip[];
  label?: string;
}) {
  if (chips.length === 0) return null;
  return (
    <nav
      aria-label={label}
      className="flex flex-wrap items-center gap-2"
      data-testid="filtros-rapidos"
    >
      <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {label}
      </span>
      {chips.map((chip) => {
        const tone = TONES[chip.tone];
        return (
          <Link
            key={chip.key}
            href={chip.href}
            aria-current={chip.active ? "true" : undefined}
            aria-label={
              chip.count === undefined
                ? undefined
                : `${chip.label} (${chip.count})`
            }
            title={chip.active ? "Quitar este filtro" : undefined}
            data-tone={chip.tone}
            className={cn(
              "focus-visible:ring-ring/50 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-colors outline-none focus-visible:ring-[3px] pointer-coarse:py-2",
              chip.active ? tone.active : tone.idle,
            )}
          >
            {chip.active ? <Check className="size-3.5" aria-hidden /> : null}
            {chip.label}
            {chip.count === undefined ? null : (
              <span
                aria-hidden
                data-testid="contador"
                className={cn(
                  "min-w-5 rounded-full px-1.5 text-center text-xs tabular-nums",
                  chip.active ? "bg-white/20 text-current" : tone.count,
                )}
              >
                {chip.count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
