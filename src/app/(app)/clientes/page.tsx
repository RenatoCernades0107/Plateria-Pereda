import type { Metadata } from "next";

import { ClientsList } from "@/components/clients/clients-list";
import { ClientsSearch } from "@/components/clients/clients-search";
import { NewClientDialog } from "@/components/clients/new-client-dialog";
import { PageHeader } from "@/components/page-header";
import { RefreshWhilePending } from "@/components/shopify/refresh-while-pending";
import { can } from "@/domain/permissions";
import { requirePermission } from "@/server/auth";
import { listRecentClients } from "@/server/clients/queries";

export const metadata: Metadata = { title: "Clientes" };

export default async function ClientesPage() {
  const user = await requirePermission("clientes.ver");
  const canEdit = can(user.role, "clientes.editar");
  const clients = await listRecentClients();

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
      <ClientsList clients={clients} canRetry={canEdit} />
      <RefreshWhilePending
        pending={clients.some(
          (c) =>
            c.sync?.status === "pending" || c.sync?.status === "processing",
        )}
      />
    </div>
  );
}
