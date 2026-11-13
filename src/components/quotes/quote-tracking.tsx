"use client";

import { MapPin, Wrench } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useTransition } from "react";
import { toast } from "sonner";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  isQuoteWorkLocation,
  QUOTE_WORK_LOCATION_LABELS,
  QUOTE_WORK_LOCATIONS,
  type QuoteWorkLocation,
} from "@/domain/quote-tracking";
import { cn } from "@/lib/utils";
import { setQuoteTracking } from "@/server/quotes/actions";

const NONE = "ninguno";

/**
 * Taller y ubicación del trabajo de una cotización aprobada (aceptada o facturada):
 * cada cambio se guarda al elegirlo. El taller lo cambian logística y el admin
 * (`canAssignWorkshop`); si no se puede, se muestra como texto.
 */
export function QuoteTrackingControls({
  quoteId,
  workLocation,
  workshopId,
  workshopName,
  workshops,
  canAssignWorkshop,
  className,
}: {
  quoteId: string;
  workLocation: QuoteWorkLocation | null;
  workshopId: string | null;
  workshopName: string | null;
  workshops: { id: string; name: string }[];
  canAssignWorkshop: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const workshopLabel = useId();
  const locationLabel = useId();

  const save = (
    changes: Parameters<typeof setQuoteTracking>[1],
    done: string,
  ) =>
    startTransition(async () => {
      const result = await setQuoteTracking(quoteId, changes);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(done);
      router.refresh();
    });

  return (
    <div
      className={cn("grid gap-3 sm:grid-cols-2", className)}
      data-testid="seguimiento-cotizacion"
    >
      <div className="space-y-1.5">
        <Label htmlFor={workshopLabel} className="flex items-center gap-1.5">
          <Wrench aria-hidden className="size-3.5" />
          Taller
        </Label>
        {canAssignWorkshop ? (
          <Select
            value={workshopId ?? NONE}
            disabled={pending}
            onValueChange={(v) =>
              save(
                { workshopId: v === NONE ? null : v },
                v === NONE ? "Se quitó el taller." : "Taller asignado.",
              )
            }
          >
            <SelectTrigger id={workshopLabel} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Sin taller</SelectItem>
              {workshops.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p id={workshopLabel} className="text-sm">
            {workshopName ?? "Sin taller"}
          </p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={locationLabel} className="flex items-center gap-1.5">
          <MapPin aria-hidden className="size-3.5" />
          Ubicación del trabajo
        </Label>
        <Select
          value={workLocation ?? NONE}
          disabled={pending}
          onValueChange={(v) =>
            save(
              { workLocation: isQuoteWorkLocation(v) ? v : null },
              isQuoteWorkLocation(v)
                ? `Ubicación: ${QUOTE_WORK_LOCATION_LABELS[v]}.`
                : "Se quitó la ubicación.",
            )
          }
        >
          <SelectTrigger id={locationLabel} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Sin definir</SelectItem>
            {QUOTE_WORK_LOCATIONS.map((l) => (
              <SelectItem key={l} value={l}>
                {QUOTE_WORK_LOCATION_LABELS[l]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

/** Taller y ubicación en una línea de texto, para los listados. */
export function QuoteTrackingText({
  workLocation,
  workshopName,
  className,
}: {
  workLocation: QuoteWorkLocation | null;
  workshopName: string | null;
  className?: string;
}) {
  if (!workLocation && !workshopName) return null;
  return (
    <span
      className={cn(
        "text-muted-foreground inline-flex flex-wrap items-center gap-x-2 text-xs",
        className,
      )}
      data-testid="seguimiento-cotizacion-texto"
    >
      {workLocation ? (
        <span className="inline-flex items-center gap-1">
          <MapPin aria-hidden className="size-3.5 shrink-0" />
          {QUOTE_WORK_LOCATION_LABELS[workLocation]}
        </span>
      ) : null}
      {workshopName ? (
        <span className="inline-flex items-center gap-1">
          <Wrench aria-hidden className="size-3.5 shrink-0" />
          {workshopName}
        </span>
      ) : null}
    </span>
  );
}
