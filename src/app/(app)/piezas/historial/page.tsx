import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { PiecesHistoryFiltersForm } from "@/components/restorations/pieces-history-filters-form";
import { PiecesHistoryTable } from "@/components/restorations/pieces-history-table";
import { Button } from "@/components/ui/button";
import { can } from "@/domain/permissions";
import {
  parsePieceHistoryFilters,
  pieceHistoryHref,
} from "@/domain/piece-history-filters";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/server/auth";
import { listPiecesHistory } from "@/server/restorations/piece-history-queries";

export const metadata: Metadata = { title: "Historial de piezas" };

/**
 * Historial de piezas terminadas: las entregadas salen de la vista de piezas al día
 * siguiente de la entrega y se consultan aquí, junto con las anuladas y las
 * rechazadas o sin arreglo ya devueltas.
 */
export default async function PiezasHistorialPage({
  searchParams,
}: PageProps<"/piezas/historial">) {
  const user = await requirePermission("restauraciones.ver");
  const filters = parsePieceHistoryFilters(await searchParams);
  const supabase = await createClient();
  const [{ items, total, pages }, workshops] = await Promise.all([
    listPiecesHistory(filters),
    // Con los inactivos: una pieza antigua pudo ir a un taller que ya no se usa.
    supabase.from("workshops").select("id, name").order("name"),
  ]);
  if (workshops.error) throw workshops.error;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <PageHeader
          title="Historial de piezas"
          description="Piezas entregadas, anuladas, rechazadas o sin arreglo ya devueltas. La vista de piezas muestra las entregadas solo el día de la entrega."
        />
        <Button asChild variant="outline" size="sm">
          <Link href="/piezas">
            <ArrowLeft />
            Volver a piezas
          </Link>
        </Button>
      </div>
      <PiecesHistoryFiltersForm
        // Al navegar con otros filtros el formulario se reinicia con los de la URL.
        key={pieceHistoryHref(filters)}
        filters={filters}
        workshops={workshops.data}
      />
      <PiecesHistoryTable
        pieces={items}
        showCost={can(user.role, "piezas.costo-servicio")}
        showPrice={can(user.role, "dinero.ver")}
      />
      <nav
        aria-label="Paginación"
        className="flex items-center justify-between gap-2 text-sm"
      >
        <span className="text-muted-foreground">
          {total === 1 ? "1 pieza" : `${total} piezas`} · Página {filters.page}{" "}
          de {pages}
        </span>
        <div className="flex gap-2">
          {filters.page > 1 ? (
            <Button asChild variant="outline" size="sm">
              <Link
                href={pieceHistoryHref(filters, { page: filters.page - 1 })}
              >
                Anterior
              </Link>
            </Button>
          ) : null}
          {filters.page < pages ? (
            <Button asChild variant="outline" size="sm">
              <Link
                href={pieceHistoryHref(filters, { page: filters.page + 1 })}
              >
                Siguiente
              </Link>
            </Button>
          ) : null}
        </div>
      </nav>
    </div>
  );
}
