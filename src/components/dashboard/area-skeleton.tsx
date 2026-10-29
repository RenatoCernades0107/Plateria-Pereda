import { Skeleton } from "@/components/ui/skeleton";

/**
 * Esqueleto de lo que va debajo de las pestañas mientras llegan los datos de la primera
 * carga. Vive dentro de la página (no en `loading.tsx`) para que el permiso se valide
 * antes de empezar a enviar y logística reciba un 403 de verdad.
 */
export function AreaSkeleton() {
  return (
    <div
      className="space-y-5"
      aria-busy="true"
      aria-label="Cargando las métricas"
      data-testid="dashboard-cargando"
    >
      <Skeleton className="h-44 w-full rounded-2xl" />
      <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-80 w-full rounded-xl" />
    </div>
  );
}
