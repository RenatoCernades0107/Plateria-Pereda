import { Download, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { RestorationsKanban } from "@/components/restorations/restorations-kanban";
import { RestorationsFiltersForm } from "@/components/restorations/restorations-filters-form";
import { RestorationsList } from "@/components/restorations/restorations-list";
import { Button } from "@/components/ui/button";
import { ViewToggle } from "@/components/view-toggle";
import { can } from "@/domain/permissions";
import {
  parseRestorationFilters,
  restorationFiltersHref,
  restorationFiltersQuery,
} from "@/domain/restoration-filters";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/server/auth";
import { getClientName } from "@/server/quotes/queries";
import { listRestorations } from "@/server/restorations/queries";

export const metadata: Metadata = { title: "Restauraciones" };

export default async function RestauracionesPage({
  searchParams,
}: PageProps<"/restauraciones">) {
  const user = await requirePermission("restauraciones.ver");
  const canEdit = can(user.role, "restauraciones.editar");
  const filters = parseRestorationFilters(await searchParams);
  const supabase = await createClient();
  const [{ items, total, pages }, clientName, workshops] = await Promise.all([
    listRestorations(filters),
    filters.clientId ? getClientName(filters.clientId) : null,
    supabase.from("workshops").select("id, name").order("name"),
  ]);
  if (workshops.error) throw workshops.error;
  const filtered =
    restorationFiltersQuery(filters, {
      page: 1,
      sort: "created_at",
      dir: "desc",
      view: "tabla",
    }) !== "";
  const exportQuery = restorationFiltersQuery(filters, {
    page: 1,
    view: "tabla",
  });
  const kanban = filters.view === "kanban";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title="Restauraciones"
          description={
            canEdit
              ? "Todas las restauraciones, con su estado y sus pagos."
              : "Restauraciones en curso."
          }
        />
        {canEdit ? (
          <div className="flex flex-wrap gap-2">
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
          </div>
        ) : null}
      </div>
      <RestorationsFiltersForm
        // Al navegar con otros filtros el formulario se reinicia con los de la URL.
        key={restorationFiltersHref(filters)}
        filters={filters}
        clientName={clientName}
        workshops={workshops.data}
        showMoney={canEdit}
      />
      <ViewToggle
        view={filters.view}
        tableHref={restorationFiltersHref(filters, { view: "tabla", page: 1 })}
        kanbanHref={restorationFiltersHref(filters, { view: "kanban" })}
      />
      {kanban ? (
        <>
          <RestorationsKanban items={items} showMoney={canEdit} />
          <p className="text-muted-foreground text-sm">
            {items.length < total
              ? `Se muestran ${items.length} de ${total} restauraciones. Usa los filtros para ver las demás.`
              : total === 1
                ? "1 restauración"
                : `${total} restauraciones`}
          </p>
        </>
      ) : (
        <>
          <RestorationsList
            items={items}
            filters={filters}
            showMoney={canEdit}
            emptyMessage={
              filtered
                ? "No hay restauraciones con esos filtros."
                : "Aún no hay restauraciones registradas."
            }
          />
          <nav
            aria-label="Paginación"
            className="flex items-center justify-between gap-2 text-sm"
          >
            <span className="text-muted-foreground">
              {total === 1 ? "1 restauración" : `${total} restauraciones`} ·
              Página {filters.page} de {pages}
            </span>
            <div className="flex gap-2">
              {filters.page > 1 ? (
                <Button asChild variant="outline" size="sm">
                  <Link
                    href={restorationFiltersHref(filters, {
                      page: filters.page - 1,
                    })}
                  >
                    Anterior
                  </Link>
                </Button>
              ) : null}
              {filters.page < pages ? (
                <Button asChild variant="outline" size="sm">
                  <Link
                    href={restorationFiltersHref(filters, {
                      page: filters.page + 1,
                    })}
                  >
                    Siguiente
                  </Link>
                </Button>
              ) : null}
            </div>
          </nav>
        </>
      )}
    </div>
  );
}
