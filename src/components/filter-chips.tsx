import { Check } from "lucide-react";
import Link from "next/link";

import type { FilterChip } from "@/domain/filter-presets";
import { cn } from "@/lib/utils";

/** Chips de filtros de un clic (K12): enlaces con el filtro en la URL. */
export function FilterChips({
  chips,
  label = "Filtros rápidos",
}: {
  chips: FilterChip[];
  label?: string;
}) {
  if (chips.length === 0) return null;
  return (
    <nav aria-label={label} className="flex flex-wrap gap-2">
      {chips.map((chip) => (
        <Link
          key={chip.key}
          href={chip.href}
          aria-current={chip.active ? "true" : undefined}
          title={chip.active ? "Quitar este filtro" : undefined}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm font-medium transition-colors",
            chip.active
              ? "border-primary bg-primary text-primary-foreground"
              : "bg-background text-foreground hover:bg-muted",
          )}
        >
          {chip.active ? <Check className="size-3.5" aria-hidden /> : null}
          {chip.label}
        </Link>
      ))}
    </nav>
  );
}
