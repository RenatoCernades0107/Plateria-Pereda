import { Skeleton } from "@/components/ui/skeleton";

/** Mientras carga una sección: título, filtros y filas (el menú queda visible). */
export default function Loading() {
  return (
    <div className="space-y-4" role="status" aria-label="Cargando">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-9" />
        ))}
      </div>
      <div className="space-y-2 pt-2">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-12" />
        ))}
      </div>
      <span className="sr-only">Cargando…</span>
    </div>
  );
}
