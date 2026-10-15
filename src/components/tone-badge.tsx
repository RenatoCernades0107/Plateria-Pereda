import type { ComponentProps, ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import type { BadgeTone } from "@/domain/status-progress";
import { cn } from "@/lib/utils";

/**
 * Familia única de insignias de estado (pedido del 2026-10-15): píldora de fondo suave
 * con un indicador de color al inicio (un punto, o el icono de progreso de S5). Todas
 * las vistas usan las mismas, así un estado se lee igual en todas partes. Texto con
 * contraste AA en tema claro y oscuro; el texto siempre acompaña al color.
 */
export const TONE_STYLES: Record<
  BadgeTone,
  { className: string; dot: string }
> = {
  neutral: {
    className: "border-border bg-muted/60 text-foreground dark:bg-muted/40",
    dot: "bg-muted-foreground",
  },
  info: {
    className:
      "border-sky-200 bg-sky-50 text-sky-950 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-50",
    dot: "bg-sky-600 dark:bg-sky-400",
  },
  success: {
    className:
      "border-green-200 bg-green-50 text-green-950 dark:border-green-800 dark:bg-green-950 dark:text-green-50",
    dot: "bg-green-600 dark:bg-green-400",
  },
  attention: {
    className:
      "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-50",
    dot: "bg-amber-500 dark:bg-amber-400",
  },
  critical: {
    className:
      "border-red-200 bg-red-50 text-red-950 dark:border-red-800 dark:bg-red-950 dark:text-red-50",
    dot: "bg-red-600 dark:bg-red-400",
  },
};

/** Lo anulado o descartado: tenue y tachado. */
export const CANCELLED_CLASS = "text-muted-foreground line-through";

/** Punto de color de una insignia (decorativo: el texto va al lado). */
export function StatusDot({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      data-slot="status-dot"
      className={cn("size-1.5 shrink-0 rounded-full", className)}
    />
  );
}

/**
 * Insignia de estado con su tono. `indicator` reemplaza el punto (p. ej. el icono de
 * progreso); `null` la deja sin indicador.
 */
export function ToneBadge({
  tone,
  indicator,
  className,
  children,
  ...props
}: {
  tone: BadgeTone;
  indicator?: ReactNode;
  children: ReactNode;
} & Omit<ComponentProps<"span">, "children">) {
  const style = TONE_STYLES[tone];
  return (
    <Badge
      variant="outline"
      data-tone={tone}
      className={cn(style.className, className)}
      {...props}
    >
      {indicator === undefined ? (
        <StatusDot className={style.dot} />
      ) : (
        indicator
      )}
      {children}
    </Badge>
  );
}
