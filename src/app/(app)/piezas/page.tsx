import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { PiecesBoardFiltersForm } from "@/components/restorations/pieces-board-filters-form";
import { PiecesBoardTable } from "@/components/restorations/pieces-board-table";
import { Button } from "@/components/ui/button";
import {
  parsePieceBoardFilters,
  pieceBoardHref,
  WORKSHOP_DAYS_ALERT,
} from "@/domain/piece-board-filters";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/server/auth";
import { listPiecesBoard } from "@/server/restorations/queries";

export const metadata: Metadata = { title: "Piezas" };

export default async function PiezasPage({
  searchParams,
}: PageProps<"/piezas">) {
  const user = await requirePermission("restauraciones.ver");
  const filters = parsePieceBoardFilters(await searchParams);
  const supabase = await createClient();
  const [{ items, total, pages }, workshops] = await Promise.all([
    listPiecesBoard(filters),
    supabase
      .from("workshops")
      .select("id, name")
      .eq("active", true)
      .order("name"),
  ]);
  if (workshops.error) throw workshops.error;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Piezas"
        description={`Piezas en curso de todas las restauraciones. Se resaltan las que llevan ${WORKSHOP_DAYS_ALERT} días o más en el taller.`}
      />
      <PiecesBoardFiltersForm
        // Al navegar con otros filtros el formulario se reinicia con los de la URL.
        key={pieceBoardHref(filters)}
        filters={filters}
        workshops={workshops.data}
      />
      <PiecesBoardTable
        pieces={items}
        role={user.role}
        workshops={workshops.data}
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
              <Link href={pieceBoardHref(filters, { page: filters.page - 1 })}>
                Anterior
              </Link>
            </Button>
          ) : null}
          {filters.page < pages ? (
            <Button asChild variant="outline" size="sm">
              <Link href={pieceBoardHref(filters, { page: filters.page + 1 })}>
                Siguiente
              </Link>
            </Button>
          ) : null}
        </div>
      </nav>
    </div>
  );
}
