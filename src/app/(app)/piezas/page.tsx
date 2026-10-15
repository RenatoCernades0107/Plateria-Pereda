import { History } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { FilteredEmptyState } from "@/components/empty-state";
import { FilterChips } from "@/components/filter-chips";
import { Pagination } from "@/components/pagination";
import { PageHeader } from "@/components/page-header";
import { PiecesBoardFiltersForm } from "@/components/restorations/pieces-board-filters-form";
import { PiecesKanban } from "@/components/restorations/pieces-kanban";
import { PiecesBoardTable } from "@/components/restorations/pieces-board-table";
import { Button } from "@/components/ui/button";
import { ViewToggle } from "@/components/view-toggle";
import {
  pieceChipCountFilters,
  pieceFilterChips,
} from "@/domain/filter-presets";
import {
  parsePieceBoardFilters,
  pieceBoardHref,
  WORKSHOP_DAYS_ALERT,
} from "@/domain/piece-board-filters";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/server/auth";
import { boardBalanceDue } from "@/server/restorations/board-balance";
import {
  countPiecesBoard,
  listPiecesBoard,
} from "@/server/restorations/queries";

export const metadata: Metadata = { title: "Piezas" };

export default async function PiezasPage({
  searchParams,
}: PageProps<"/piezas">) {
  const user = await requirePermission("restauraciones.ver");
  const filters = parsePieceBoardFilters(await searchParams);
  const supabase = await createClient();
  // Contadores de los chips: lo que daría cada uno con los demás filtros.
  const chipFilters = pieceChipCountFilters(filters);
  const [{ items, total, pages }, workshops, chipTotals] = await Promise.all([
    listPiecesBoard(filters),
    supabase
      .from("workshops")
      .select("id, name")
      .eq("active", true)
      .order("name"),
    Promise.all(
      chipFilters.map((c) => (c.active ? null : countPiecesBoard(c.filters))),
    ),
  ]);
  if (workshops.error) throw workshops.error;
  const counts = Object.fromEntries(
    chipFilters.map((c, i) => [c.key, chipTotals[i] ?? total]),
  );
  const resetHref = pieceBoardHref(parsePieceBoardFilters({}), {
    view: filters.view,
  });
  const filtered =
    pieceBoardHref(filters, { page: 1, view: "tabla" }) !== "/piezas";
  const summary =
    filters.view === "kanban" && items.length < total
      ? `Se muestran ${items.length} de ${total} piezas. Usa los filtros para ver las demás.`
      : total === 1
        ? "1 pieza"
        : `${total} piezas`;
  // "Entregar" desde una fila de la tabla pide confirmar si falta cobrar el saldo.
  const balanceDue =
    filters.view === "kanban" ? [] : await boardBalanceDue(items);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Piezas"
        description={`Piezas en curso de todas las restauraciones y las entregadas hoy. Se resaltan las que llevan ${WORKSHOP_DAYS_ALERT} días o más en el taller.`}
      />
      {/* Atajos de un clic en su propia franja, bajo el título, como en Restauraciones. */}
      <FilterChips
        label="Mostrar solo"
        chips={pieceFilterChips(filters, counts)}
      />
      <PiecesBoardFiltersForm filters={filters} workshops={workshops.data} />
      {/* Barra de la lista: cuántas hay y, juntas, las acciones de la vista. */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
        <p className="text-muted-foreground text-sm" data-testid="resumen">
          {summary}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <ViewToggle
            view={filters.view}
            tableHref={pieceBoardHref(filters, { view: "tabla", page: 1 })}
            kanbanHref={pieceBoardHref(filters, { view: "kanban" })}
          />
          <Button asChild variant="outline">
            <Link href="/piezas/historial">
              <History />
              Historial
            </Link>
          </Button>
        </div>
      </div>
      {total === 0 && filtered ? (
        <FilteredEmptyState resetHref={resetHref} />
      ) : filters.view === "kanban" ? (
        <PiecesKanban
          pieces={items}
          role={user.role}
          workshops={workshops.data}
        />
      ) : (
        <>
          <PiecesBoardTable
            balanceDue={balanceDue}
            pieces={items}
            role={user.role}
            workshops={workshops.data}
          />
          <Pagination
            page={filters.page}
            pages={pages}
            total={total}
            noun={["pieza", "piezas"]}
            hrefFor={(page) => pieceBoardHref(filters, { page })}
          />
        </>
      )}
    </div>
  );
}
