import { ArrowLeft, Building2, User } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EntityHistorySection } from "@/components/audit/entity-history-section";
import { ActiveToggle } from "@/components/clients/active-toggle";
import { ContactsSection } from "@/components/clients/contacts-section";
import { EditClientDialog } from "@/components/clients/edit-client-dialog";
import { RefreshWhilePending } from "@/components/shopify/refresh-while-pending";
import { SyncStatus } from "@/components/shopify/sync-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DOCUMENT_LABELS } from "@/domain/documents";
import { can } from "@/domain/permissions";
import { formatPhone } from "@/domain/phone";
import { PERU_REGIONS } from "@/domain/regions";
import { cn } from "@/lib/utils";
import { requirePermission } from "@/server/auth";
import { getClientDetail, type SyncState } from "@/server/clients/queries";

export const metadata: Metadata = { title: "Cliente" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function Field({
  label,
  value,
  className,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-0.5", className)}>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm break-words">{value || "—"}</dd>
    </div>
  );
}

const isPending = (sync: SyncState | null) =>
  sync?.status === "pending" || sync?.status === "processing";

export default async function ClienteDetallePage({
  params,
}: PageProps<"/clientes/[id]">) {
  const user = await requirePermission("clientes.ver");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const client = await getClientDetail(id);
  if (!client) notFound();

  const canEdit = can(user.role, "clientes.editar");
  // Logística solo ve los datos de contacto (P42).
  const canSeeHistory = can(user.role, "historial.ver");
  const Icon = client.kind === "empresa" ? Building2 : User;
  const region = PERU_REGIONS.find((r) => r.code === client.region)?.name;

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/clientes">
          <ArrowLeft />
          Clientes
        </Link>
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-heading flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
            {client.displayName}
            {client.active ? null : <Badge variant="outline">Inactivo</Badge>}
          </h1>
          <p className="text-muted-foreground flex items-center gap-1 text-sm">
            <Icon className="size-4" aria-hidden />
            {client.kind === "empresa" ? "Empresa" : "Persona"}
          </p>
          {client.sync ? (
            <SyncStatus
              jobId={client.sync.jobId}
              status={client.sync.status}
              lastError={client.sync.lastError}
              canRetry={canEdit}
            />
          ) : null}
        </div>
        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            <EditClientDialog client={client} />
            <ActiveToggle
              entity="client"
              id={client.id}
              name={client.displayName}
              active={client.active}
            />
          </div>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Datos</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field
              label="Documento"
              value={
                client.documentType
                  ? `${DOCUMENT_LABELS[client.documentType]} ${client.documentNumber}`
                  : null
              }
            />
            <Field
              label="Teléfono"
              value={client.phone ? formatPhone(client.phone) : null}
            />
            <Field label="Email" value={client.email} />
            <Field label="Dirección" value={client.address} />
            {client.kind === "empresa" ? (
              <Field
                label="Ciudad y región"
                value={[client.city, region].filter(Boolean).join(", ")}
              />
            ) : null}
            {canSeeHistory ? (
              <Field
                className="sm:col-span-2 lg:col-span-3"
                label="Notas"
                value={
                  client.notes ? (
                    <span className="whitespace-pre-line">{client.notes}</span>
                  ) : null
                }
              />
            ) : null}
          </dl>
        </CardContent>
      </Card>

      {client.kind === "empresa" ? (
        <ContactsSection client={client} canEdit={canEdit} />
      ) : null}

      {canSeeHistory ? (
        <>
          <section className="space-y-3" aria-labelledby="restauraciones">
            <h2
              id="restauraciones"
              className="text-heading text-lg font-semibold"
            >
              Restauraciones y cotizaciones
            </h2>
            <p className="text-muted-foreground rounded-md border p-6 text-center text-sm">
              Aquí se verán las restauraciones y cotizaciones del cliente.
            </p>
          </section>
          <section className="space-y-3" aria-labelledby="historial">
            <h2 id="historial" className="text-heading text-lg font-semibold">
              Historial de cambios
            </h2>
            <EntityHistorySection table="clients" recordId={client.id} />
          </section>
        </>
      ) : null}

      <RefreshWhilePending
        pending={
          isPending(client.sync) ||
          client.contacts.some((k) => isPending(k.sync))
        }
      />
    </div>
  );
}
