import { History } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { FilterChips } from "@/components/filter-chips";
import { Pagination } from "@/components/pagination";
import { PageHeader } from "@/components/page-header";
import { PiecesBoardFiltersForm } from "@/components/restorations/pieces-board-filters-form";
import { PiecesKanban } from "@/components/restorations/pieces-kanban";
import { PiecesBoardTable } from "@/components/restorations/pieces-board-table";
import { Button } from "@/components/ui/button";
import { ViewToggle } from "@/components/view-toggle";
import { pieceFilterChips } from "@/domain/filter-presets";
import {
  parsePieceBoardFilters,
  pieceBoardHref,
  WORKSHOP_DAYS_ALERT,
} from "@/domain/piece-board-filters";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/server/auth";
import { boardBalanceDue } from "@/server/restorations/board-balance";
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
  // "Entregar" desde una fila de la tabla pide confirmar si falta cobrar el saldo.
  const balanceDue =
    filters.view === "kanban" ? [] : await boardBalanceDue(items);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <PageHeader
          title="Piezas"
          description={`Piezas en curso de todas las restauraciones y las entregadas hoy. Se resaltan las que llevan ${WORKSHOP_DAYS_ALERT} días o más en el taller.`}
        />
        <Button asChild variant="outline" size="sm">
          <Link href="/piezas/historial">
            <History />
            Historial
          </Link>
        </Button>
      </div>
      <PiecesBoardFiltersForm
        // Al navegar con otros filtros el formulario se reinicia con los de la URL.
        key={pieceBoardHref(filters)}
        filters={filters}
        workshops={workshops.data}
      />
      {/* Un solo juego de filtros: los atajos de un clic van aquí, no en el formulario. */}
      <FilterChips label="Mostrar solo" chips={pieceFilterChips(filters)} />
      <ViewToggle
        view={filters.view}
        tableHref={pieceBoardHref(filters, { view: "tabla", page: 1 })}
        kanbanHref={pieceBoardHref(filters, { view: "kanban" })}
      />
      {filters.view === "kanban" ? (
        <>
          <PiecesKanban
            pieces={items}
            role={user.role}
            workshops={workshops.data}
          />
          <p className="text-muted-foreground text-sm">
            {items.length < total
              ? `Se muestran ${items.length} de ${total} piezas. Usa los filtros para ver las demás.`
              : total === 1
                ? "1 pieza"
                : `${total} piezas`}
          </p>
        </>
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
