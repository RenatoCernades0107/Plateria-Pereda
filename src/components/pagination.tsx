import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Pie de un listado paginado: cuántos registros hay, en qué página se está y los
 * enlaces Anterior/Siguiente (la página va en la URL). `noun` es el sustantivo en
 * singular y plural, p. ej. `["pieza", "piezas"]`.
 */
export function Pagination({
  page,
  pages,
  total,
  noun,
  hrefFor,
  className,
}: {
  page: number;
  pages: number;
  total: number;
  noun: readonly [singular: string, plural: string];
  hrefFor: (page: number) => string;
  className?: string;
}) {
  return (
    <nav
      aria-label="Paginación"
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 text-sm",
        className,
      )}
    >
      <span className="text-muted-foreground">
        {total === 1 ? `1 ${noun[0]}` : `${total} ${noun[1]}`} · Página {page}{" "}
        de {pages}
      </span>
      <div className="flex gap-2">
        {page > 1 ? (
          <Button asChild variant="outline" size="sm">
            <Link href={hrefFor(page - 1)} rel="prev">
              <ChevronLeft aria-hidden />
              Anterior
            </Link>
          </Button>
        ) : null}
        {page < pages ? (
          <Button asChild variant="outline" size="sm">
            <Link href={hrefFor(page + 1)} rel="next">
              Siguiente
              <ChevronRight aria-hidden />
            </Link>
          </Button>
        ) : null}
      </div>
    </nav>
  );
}
