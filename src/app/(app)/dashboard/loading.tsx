import { Skeleton } from "@/components/ui/skeleton";

/** Esqueleto de la primera carga: el marco del dashboard con sus tarjetas por llegar. */
export default function DashboardLoading() {
  return (
    <div
      className="space-y-5"
      aria-busy="true"
      aria-label="Cargando el dashboard"
    >
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <Skeleton className="h-10 w-full max-w-xl rounded-xl" />
      <Skeleton className="h-9 w-full max-w-2xl" />
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
