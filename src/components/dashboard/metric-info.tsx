"use client";

import { Info } from "lucide-react";
import type { ReactNode } from "react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** Botón ⓘ que abre una explicación de cómo se calcula una métrica. */
export function MetricInfo({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger
        type="button"
        aria-label={`Cómo se calcula: ${label}`}
        data-testid="metric-info"
        className={cn(
          "text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 relative z-10 inline-flex size-5 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-2",
          className,
        )}
      >
        <Info aria-hidden className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72 text-sm"
        data-testid="metric-info-contenido"
      >
        <p className="text-heading mb-1 font-medium">Cómo se calcula</p>
        <p className="text-muted-foreground leading-relaxed">{children}</p>
      </PopoverContent>
    </Popover>
  );
}
