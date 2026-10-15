import { Check } from "lucide-react";
import Link from "next/link";

import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import type { FilterChip, FilterChipTone } from "@/domain/filter-presets";
import { cn } from "@/lib/utils";

/** Tonos de las insignias de estado (texto siempre presente; contraste AA). */
const TONES: Record<FilterChipTone, string> = {
  neutral: "border-border bg-background text-foreground hover:bg-muted",
  info: "border-transparent bg-sky-100 text-sky-950 hover:bg-sky-200 dark:bg-sky-900 dark:text-sky-50 dark:hover:bg-sky-800",
  success:
    "border-transparent bg-green-100 text-green-950 hover:bg-green-200 dark:bg-green-900 dark:text-green-50 dark:hover:bg-green-800",
  attention:
    "border-transparent bg-amber-100 text-amber-950 hover:bg-amber-200 dark:bg-amber-900 dark:text-amber-50 dark:hover:bg-amber-800",
  urgent:
    "border-transparent bg-amber-300 text-amber-950 hover:bg-amber-400",
  whatsapp:
    "border-whatsapp/50 bg-whatsapp/10 hover:bg-whatsapp/20 [&>svg]:text-whatsapp-strong",
};

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
            TONES[chip.tone],
            chip.dashed && "border-dashed border-foreground/40",
            chip.active && "ring-2 ring-foreground/60",
          )}
        >
          {chip.tone === "whatsapp" ? (
            <WhatsAppIcon className="size-3.5" aria-hidden />
          ) : null}
          {chip.active ? <Check className="size-3.5" aria-hidden /> : null}
          {chip.label}
        </Link>
      ))}
    </nav>
  );
}
