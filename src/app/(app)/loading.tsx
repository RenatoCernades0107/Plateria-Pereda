import { Skeleton } from "@/components/ui/skeleton";

/**
 * Mientras el servidor arma una sección (Paso 15.3): el menú queda y el contenido se
 * reemplaza por un esqueleto, en vez de dejar la página anterior congelada.
 */
export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="space-y-4">
      <span className="sr-only">Cargando…</span>
      <Skeleton className="h-8 w-48" />
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-9 w-full sm:w-64" />
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}
