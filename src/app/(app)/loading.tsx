import { Skeleton } from "@/components/ui/skeleton";

/** Esqueleto inmediato al navegar entre vistas mientras el servidor carga los datos. */
export default function Loading() {
  return (
    <div className="space-y-6" role="status" aria-label="Cargando…">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <Skeleton className="h-9 w-full max-w-xl" />
      <div className="space-y-2">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}
