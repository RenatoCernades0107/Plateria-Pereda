import type { Metadata } from "next";
import Link from "next/link";

import { ClientsFiltersForm } from "@/components/clients/clients-filters-form";
import { ClientsList } from "@/components/clients/clients-list";
import { ClientsSearch } from "@/components/clients/clients-search";
import { NewClientDialog } from "@/components/clients/new-client-dialog";
import { PageHeader } from "@/components/page-header";
import { RefreshWhilePending } from "@/components/shopify/refresh-while-pending";
import { Button } from "@/components/ui/button";
import { clientFiltersHref, parseClientFilters } from "@/domain/client-filters";
import { can } from "@/domain/permissions";
import { requirePermission } from "@/server/auth";
import { listClients } from "@/server/clients/queries";

export const metadata: Metadata = { title: "Clientes" };

export default async function ClientesPage({
  searchParams,
}: PageProps<"/clientes">) {
  const user = await requirePermission("clientes.ver");
  const canEdit = can(user.role, "clientes.editar");
  const filters = parseClientFilters(await searchParams);
  const { clients, total, pages } = await listClients(filters);
  const filtered = clientFiltersHref(filters, { page: 1 }) !== "/clientes";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title="Clientes"
          description="Personas y empresas. Cada cliente se crea también en Shopify."
        />
        {canEdit ? <NewClientDialog /> : null}
      </div>
      <ClientsSearch canCreate={canEdit} />
      <ClientsFiltersForm
        // Al navegar con otros filtros el formulario se reinicia con los de la URL.
        key={clientFiltersHref(filters)}
        filters={filters}
      />
      <ClientsList
        clients={clients}
        canRetry={canEdit}
        emptyMessage={
          filtered
            ? "No hay clientes con esos filtros."
            : "Aún no hay clientes registrados."
        }
      />
      <nav
        aria-label="Paginación"
        className="flex items-center justify-between gap-2 text-sm"
      >
        <span className="text-muted-foreground">
          {total === 1 ? "1 cliente" : `${total} clientes`} · Página{" "}
          {filters.page} de {pages}
        </span>
        <div className="flex gap-2">
          {filters.page > 1 ? (
            <Button asChild variant="outline" size="sm">
              <Link
                href={clientFiltersHref(filters, { page: filters.page - 1 })}
              >
                Anterior
              </Link>
            </Button>
          ) : null}
          {filters.page < pages ? (
            <Button asChild variant="outline" size="sm">
              <Link
                href={clientFiltersHref(filters, { page: filters.page + 1 })}
              >
                Siguiente
              </Link>
            </Button>
          ) : null}
        </div>
      </nav>
      <RefreshWhilePending
        pending={clients.some(
          (c) =>
            c.sync?.status === "pending" || c.sync?.status === "processing",
        )}
      />
    </div>
  );
}
