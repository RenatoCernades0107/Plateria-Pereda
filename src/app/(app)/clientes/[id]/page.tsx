import { ArrowLeft, Building2, User } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageBreadcrumb } from "@/components/page-breadcrumb";
import { EntityHistorySection } from "@/components/audit/entity-history-section";
import { ActiveToggle } from "@/components/clients/active-toggle";
import { ClientWorkTabs } from "@/components/clients/client-work-tabs";
import { ContactsSection } from "@/components/clients/contacts-section";
import { EditClientDialog } from "@/components/clients/edit-client-dialog";
import { MergeClientDialog } from "@/components/clients/merge-client-dialog";
import { Notice } from "@/components/notice";
import { RefreshWhilePending } from "@/components/shopify/refresh-while-pending";
import { SyncStatus } from "@/components/shopify/sync-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DOCUMENT_LABELS } from "@/domain/documents";
import { can } from "@/domain/permissions";
import { formatPhone } from "@/domain/phone";
import { parseQuoteFilters } from "@/domain/quote-filters";
import { PERU_REGIONS } from "@/domain/regions";
import { parseRestorationFilters } from "@/domain/restoration-filters";
import { parseWhatsappQuoteFilters } from "@/domain/whatsapp-quotes";
import { cn } from "@/lib/utils";
import { requirePermission } from "@/server/auth";
import { recordMetadata } from "@/server/page-titles";
import { getClientDetail, type SyncState } from "@/server/clients/queries";
import { listQuotes } from "@/server/quotes/queries";
import { listRestorations } from "@/server/restorations/queries";
import { listWhatsappQuotes } from "@/server/whatsapp-quotes/queries";

export async function generateMetadata({
  params,
}: PageProps<"/clientes/[id]">): Promise<Metadata> {
  return recordMetadata("client", (await params).id, "Cliente");
}

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

/** Cuántas restauraciones o cotizaciones se muestran en el cliente. */
const CLIENT_LIST_LIMIT = 10;

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
  // Solo personas activas que no se fusionaron (el duplicado se elige en el diálogo).
  const canMerge =
    can(user.role, "clientes.fusionar") &&
    client.kind === "persona" &&
    client.active &&
    !client.mergedInto;
  // Logística solo ve los datos de contacto (P42).
  const canSeeHistory = can(user.role, "historial.ver");
  const Icon = client.kind === "empresa" ? Building2 : User;
  // Restauraciones, cotizaciones personalizadas y cotizaciones de WhatsApp del
  // cliente, en pestañas separadas (P46).
  const work = canSeeHistory
    ? await Promise.all([
        listRestorations(
          {
            ...parseRestorationFilters({}),
            clientId: client.id,
            scope: "todas",
          },
          { limit: CLIENT_LIST_LIMIT },
        ),
        can(user.role, "cotizaciones-whatsapp.usar")
          ? listWhatsappQuotes(
              { ...parseWhatsappQuoteFilters({}), clientId: client.id },
              { limit: CLIENT_LIST_LIMIT },
            )
          : Promise.resolve(null),
        can(user.role, "cotizador.usar")
          ? listQuotes(
              { ...parseQuoteFilters({}), clientId: client.id },
              { limit: CLIENT_LIST_LIMIT },
            )
          : Promise.resolve(null),
      ]).then(([restorations, quotes, customQuotes]) => ({
        restorations,
        quotes,
        customQuotes,
      }))
    : null;
  const region = PERU_REGIONS.find((r) => r.code === client.region)?.name;

  return (
    <div className="space-y-6">
      <PageBreadcrumb label={client.displayName} />
      {/* En pantallas grandes la ruta de navegación del encabezado ya lleva atrás. */}
      <Button asChild variant="ghost" size="sm" className="-ml-2 md:hidden">
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
              detail="inline"
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
              size="default"
            />
            {canMerge ? <MergeClientDialog client={client} /> : null}
          </div>
        ) : null}
      </div>

      {client.mergedInto ? (
        <Notice>
          Este cliente era un duplicado y se fusionó en{" "}
          <Link
            href={`/clientes/${client.mergedInto.id}`}
            className="font-medium underline underline-offset-4"
          >
            {client.mergedInto.displayName}
          </Link>
          : sus guías y cotizaciones están allí.
        </Notice>
      ) : null}

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
            <ClientWorkTabs
              clientId={client.id}
              restorations={work!.restorations.items}
              restorationsTotal={work!.restorations.total}
              quotes={work!.quotes?.items ?? []}
              quotesTotal={work!.quotes?.total ?? 0}
              showMoney={canSeeHistory}
              showQuotes={work!.quotes !== null}
              customQuotes={work!.customQuotes?.quotes ?? []}
              customQuotesTotal={work!.customQuotes?.total ?? 0}
              showCustomQuotes={work!.customQuotes !== null}
            />
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
