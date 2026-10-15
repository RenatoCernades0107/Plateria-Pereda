import type { Metadata } from "next";

import { ClientsFiltersForm } from "@/components/clients/clients-filters-form";
import { ClientsList } from "@/components/clients/clients-list";
import { EmptyState, FilteredEmptyState } from "@/components/empty-state";
import { ClientsSearch } from "@/components/clients/clients-search";
import { NewClientDialog } from "@/components/clients/new-client-dialog";
import { Pagination } from "@/components/pagination";
import { PageHeader } from "@/components/page-header";
import { RefreshWhilePending } from "@/components/shopify/refresh-while-pending";
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
      <ClientsFiltersForm filters={filters} />
      <ClientsList
        clients={clients}
        canRetry={canEdit}
        empty={
          filtered ? (
            <FilteredEmptyState resetHref="/clientes" />
          ) : (
            <EmptyState title="Aún no hay clientes registrados." />
          )
        }
      />
      <Pagination
        page={filters.page}
        pages={pages}
        total={total}
        noun={["cliente", "clientes"]}
        hrefFor={(page) => clientFiltersHref(filters, { page })}
      />
      <RefreshWhilePending
        pending={clients.some(
          (c) =>
            c.sync?.status === "pending" || c.sync?.status === "processing",
        )}
      />
    </div>
  );
}
