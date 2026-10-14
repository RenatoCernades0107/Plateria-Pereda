import { GUIDE_CARD_CLASS } from "@/components/restorations/guide-labels";
import { Skeleton } from "@/components/ui/skeleton";

/** Mientras carga el detalle: la tarjeta de la guía, las pestañas y las piezas. */
export default function Loading() {
  return (
    <div className="space-y-6" role="status" aria-label="Cargando">
      <Skeleton className="h-8 w-36" />
      <div className={`${GUIDE_CARD_CLASS} space-y-4`}>
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72 max-w-full" />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-5 w-24 rounded-full" />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-3 border-t pt-4">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      </div>
      <Skeleton className="h-9 w-72 max-w-full" />
      <div className="space-y-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
      <span className="sr-only">Cargando…</span>
    </div>
  );
}
