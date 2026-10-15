import { ArrowLeft, Download, History, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState, FilteredEmptyState } from "@/components/empty-state";
import { FilterChips } from "@/components/filter-chips";
import { Pagination } from "@/components/pagination";
import { PageHeader } from "@/components/page-header";
import { RestorationsKanban } from "@/components/restorations/restorations-kanban";
import { RestorationsFiltersForm } from "@/components/restorations/restorations-filters-form";
import { RestorationsList } from "@/components/restorations/restorations-list";
import { Button } from "@/components/ui/button";
import { ViewToggle } from "@/components/view-toggle";
import {
  restorationChipCountFilters,
  restorationFilterChips,
} from "@/domain/filter-presets";
import { can } from "@/domain/permissions";
import {
  parseRestorationFilters,
  restorationFiltersHref,
  restorationFiltersQuery,
} from "@/domain/restoration-filters";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/server/auth";
import { getClientName } from "@/server/quotes/queries";
import {
  countRestorations,
  getPartialProgress,
  listRestorations,
} from "@/server/restorations/queries";

export const metadata: Metadata = { title: "Restauraciones" };

export default async function RestauracionesPage({
  searchParams,
}: PageProps<"/restauraciones">) {
  const user = await requirePermission("restauraciones.ver");
  const canEdit = can(user.role, "restauraciones.editar");
  const filters = parseRestorationFilters(await searchParams);
  const supabase = await createClient();
  // Contadores de los chips: lo que daría cada uno con los demás filtros.
  const chipFilters = restorationChipCountFilters(filters, {
    showMoney: canEdit,
  });
  const [{ items, total, pages }, clientName, workshops, chipTotals] =
    await Promise.all([
      listRestorations(filters),
      filters.clientId ? getClientName(filters.clientId) : null,
      supabase.from("workshops").select("id, name").order("name"),
      Promise.all(
        chipFilters.map((c) =>
          c.active ? null : countRestorations(c.filters),
        ),
      ),
    ]);
  if (workshops.error) throw workshops.error;
  const counts = Object.fromEntries(
    chipFilters.map((c, i) => [c.key, chipTotals[i] ?? total]),
  );
  const filtered =
    restorationFiltersQuery(filters, {
      page: 1,
      sort: "created_at",
      dir: "desc",
      view: "tabla",
      scope: filters.scope,
    }) !== "";
  const exportQuery = restorationFiltersQuery(filters, {
    page: 1,
    view: "tabla",
  });
  const history = filters.scope === "historial";
  const kanban = filters.view === "kanban";
  const progress = kanban ? await getPartialProgress(items) : undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title={history ? "Historial de restauraciones" : "Restauraciones"}
          description={
            history
              ? "Restauraciones anuladas, rechazadas o completadas desde antes de hoy. La vista de restauraciones muestra las completadas solo el día en que se completan."
              : canEdit
                ? "Restauraciones en curso, con su estado y sus pagos."
                : "Restauraciones en curso."
          }
        />
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link
              href={restorationFiltersHref(parseRestorationFilters({}), {
                scope: history ? "activas" : "historial",
                view: filters.view,
              })}
            >
              {history ? <ArrowLeft /> : <History />}
              {history ? "Volver a restauraciones" : "Historial"}
            </Link>
          </Button>
          {canEdit ? (
            <>
              <Button asChild variant="outline">
                <a
                  href={`/api/restauraciones/exportar${exportQuery ? `?${exportQuery}` : ""}`}
                  download
                >
                  <Download />
                  Exportar CSV
                </a>
              </Button>
              <Button asChild>
                <Link href="/restauraciones/nueva">
                  <Plus />
                  Nueva restauración
                </Link>
              </Button>
            </>
          ) : null}
        </div>
      </div>
      <FilterChips
        chips={restorationFilterChips(filters, { showMoney: canEdit, counts })}
      />
      <RestorationsFiltersForm
        filters={filters}
        clientName={clientName}
        workshops={workshops.data}
        showMoney={canEdit}
      />
      {/* Barra de la lista: cuántas hay y el cambio de vista. */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
        <p className="text-muted-foreground text-sm" data-testid="resumen">
          {kanban && items.length < total
            ? `Se muestran ${items.length} de ${total} restauraciones. Usa los filtros para ver las demás.`
            : total === 1
              ? "1 restauración"
              : `${total} restauraciones`}
        </p>
        <ViewToggle
          view={filters.view}
          tableHref={restorationFiltersHref(filters, {
            view: "tabla",
            page: 1,
          })}
          kanbanHref={restorationFiltersHref(filters, { view: "kanban" })}
        />
      </div>
      {total === 0 && filtered ? (
        <FilteredEmptyState
          resetHref={restorationFiltersHref(parseRestorationFilters({}), {
            view: filters.view,
            scope: filters.scope,
          })}
        />
      ) : kanban ? (
        <RestorationsKanban
          items={items}
          showMoney={canEdit}
          progress={progress}
        />
      ) : (
        <>
          <RestorationsList
            items={items}
            filters={filters}
            showMoney={canEdit}
            emptyMessage="Aún no hay restauraciones registradas."
            empty={
              <EmptyState
                title={
                  history
                    ? "Aún no hay restauraciones en el historial."
                    : "Aún no hay restauraciones registradas."
                }
                action={
                  canEdit && !history ? (
                    <Button asChild>
                      <Link href="/restauraciones/nueva">
                        <Plus />
                        Nueva restauración
                      </Link>
                    </Button>
                  ) : null
                }
              />
            }
          />
          <Pagination
            page={filters.page}
            pages={pages}
            total={total}
            noun={["restauración", "restauraciones"]}
            hrefFor={(page) => restorationFiltersHref(filters, { page })}
          />
        </>
      )}
    </div>
  );
}
