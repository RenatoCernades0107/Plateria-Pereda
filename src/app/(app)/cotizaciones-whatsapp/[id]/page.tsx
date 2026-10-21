import { ArrowLeft, Gem, Pencil, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageBreadcrumb } from "@/components/page-breadcrumb";
import { EntityHistorySection } from "@/components/audit/entity-history-section";
import { FilesPanel } from "@/components/files/files-panel";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import { GUIDE_CARD_CLASS } from "@/components/restorations/guide-labels";
import { QuoteMessageButton } from "@/components/restorations/quote-message-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UrlTabs } from "@/components/url-tabs";
import {
  DiscardQuoteButton,
  ReopenQuoteButton,
} from "@/components/whatsapp-quotes/quote-actions";
import { QuoteItemsTable } from "@/components/whatsapp-quotes/quote-items-table";
import { WhatsappQuoteStatusBadge } from "@/components/whatsapp-quotes/status-badge";
import { firstBeforePhotos } from "@/domain/files";
import { formatCents, PAYMENT_TYPE_LABELS } from "@/domain/money";
import { formatPhone } from "@/domain/phone";
import { buildQuoteMessage } from "@/domain/whatsapp-quote";
import {
  canCopyQuote,
  canDiscardQuote,
  canEditQuote,
  quoteAge,
} from "@/domain/whatsapp-quotes";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { requirePermission } from "@/server/auth";
import { serviceNamesById } from "@/server/catalogs";
import { listWhatsappQuoteFiles } from "@/server/files/queries";
import { recordMetadata } from "@/server/page-titles";
import { getSettings } from "@/server/settings";
import { getWhatsappQuote } from "@/server/whatsapp-quotes/queries";

export async function generateMetadata({
  params,
}: PageProps<"/cotizaciones-whatsapp/[id]">): Promise<Metadata> {
  return recordMetadata(
    "whatsappQuote",
    (await params).id,
    "Cotización de WhatsApp",
  );
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Rótulo "Cotización de WhatsApp" sobre el código (como "Guía" en la restauración). */
function QuoteEyebrow() {
  return (
    <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase">
      <WhatsAppIcon className="text-whatsapp-strong size-3.5 shrink-0" />
      Cotización de WhatsApp
    </p>
  );
}

/**
 * Detalle de una cotización de WhatsApp (P46), con el aspecto de la guía: la
 * cotización en su tarjeta (a la izquierda en pantallas anchas) y sus piezas, fotos e
 * historial en pestañas. Las fotos se copian a la restauración que se crea desde ella.
 */
export default async function CotizacionWhatsappPage({
  params,
  searchParams,
}: PageProps<"/cotizaciones-whatsapp/[id]">) {
  const user = await requirePermission("cotizaciones-whatsapp.usar");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const quote = await getWhatsappQuote(id);
  if (!quote) notFound();

  const query = await searchParams;
  const justCreated = query.registrada === "1";
  // Pestaña abierta (`?pestana=archivos`): sobrevive a recargas y se puede enlazar.
  const tab =
    typeof query.pestana === "string" &&
    ["piezas", "archivos", "historial"].includes(query.pestana)
      ? query.pestana
      : "piezas";
  const [settings, serviceNames, files] = await Promise.all([
    getSettings(),
    serviceNamesById(),
    listWhatsappQuoteFiles(quote.id),
  ]);
  const name =
    quote.contact?.name || quote.client?.name || quote.customerName || "";
  const phone =
    quote.contact?.phone ??
    quote.client?.phone ??
    (quote.customerPhone || null);
  const clientPhone =
    quote.client?.phone ??
    quote.contact?.phone ??
    (quote.customerPhone || null);
  // Mensaje propio de las cotizaciones de WhatsApp (aparte del de las guías).
  const message = buildQuoteMessage(settings.whatsappQuoteTemplate, {
    code: quote.code,
    clientName: name,
    clientPhone: clientPhone ? formatPhone(clientPhone) : null,
    clientDocument: quote.client?.documentNumber ?? null,
    pieces: quote.items.map((i) => ({
      description: i.description,
      quantity: i.quantity,
      service: i.serviceName || null,
      services: i.serviceIds.flatMap((id) => serviceNames.get(id) ?? []),
      priceCents: i.priceCents,
      status: "registrada",
    })),
    paymentType: quote.paymentType,
    depositPercent: quote.depositPercent ?? 0,
    terms: settings.terms,
    pieceStyle: "referencial",
  });
  const pendingCount = quote.items.filter((i) => !i.order).length;
  const now = new Date();
  // A dónde va cada foto: la cotización (general) o una de sus piezas.
  const fileTargets = [
    { id: null, label: "General (todas las piezas)" },
    ...quote.items.map((i) => ({
      id: i.id,
      label: `Pieza ${i.number} · ${i.description}`,
    })),
  ];
  const photos = firstBeforePhotos(files);

  return (
    <div className="space-y-6">
      <PageBreadcrumb label={quote.code} />
      {/* En pantallas grandes la ruta de navegación del encabezado ya lleva atrás. */}
      <Button asChild variant="ghost" size="sm" className="-ml-2 md:hidden">
        <Link href="/cotizaciones-whatsapp">
          <ArrowLeft />
          Cotizaciones de WhatsApp
        </Link>
      </Button>

      <div className="wide:grid-cols-[20rem_minmax(0,1fr)] grid items-start gap-6">
        <section
          aria-labelledby="codigo-cotizacion"
          className={cn(
            GUIDE_CARD_CLASS,
            "wide:sticky wide:top-4 wide:max-h-[calc(100svh-2rem)] wide:overflow-y-auto space-y-4",
          )}
          data-testid="cotizacion"
        >
          <header className="wide:flex-col flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 space-y-2">
              <QuoteEyebrow />
              <h1
                id="codigo-cotizacion"
                className="text-heading text-2xl font-semibold tracking-tight"
              >
                {quote.code}
              </h1>
              <p className="text-sm">
                {quote.client ? (
                  <Link
                    href={`/clientes/${quote.client.id}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {quote.client.name}
                  </Link>
                ) : (
                  <span className="font-medium" data-testid="sin-cliente">
                    {quote.customerName || "Sin cliente"}
                  </span>
                )}
                {quote.contact ? (
                  <span className="text-muted-foreground">
                    {" "}
                    · Contacto: {quote.contact.name}
                  </span>
                ) : null}
                {phone ? (
                  <span className="text-muted-foreground">
                    {" "}
                    · {formatPhone(phone)}
                  </span>
                ) : null}
              </p>
              <div className="flex flex-wrap gap-2">
                <span data-testid="estado-cotizacion" className="contents">
                  <WhatsappQuoteStatusBadge status={quote.status} />
                </span>
                <Badge variant="outline">
                  {pendingCount === 0
                    ? "Todas pedidas"
                    : `${pendingCount} de ${quote.items.length} pendientes`}
                </Badge>
              </div>
              <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <span>
                  {PAYMENT_TYPE_LABELS[quote.paymentType]}
                  {quote.depositPercent ? ` (${quote.depositPercent} %)` : ""}
                </span>
                <span aria-hidden>·</span>
                <span>
                  Cotizada {quoteAge(new Date(quote.createdAt), now)} (
                  {formatDateTime(new Date(quote.createdAt))})
                </span>
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {canCopyQuote({ status: quote.status, pendingCount }) ? (
                <Button asChild>
                  <Link href={`/restauraciones/nueva?cotizacion=${quote.id}`}>
                    <Plus aria-hidden />
                    Crear restauración
                  </Link>
                </Button>
              ) : null}
              {canEditQuote({
                status: quote.status,
                everCopied: quote.restorations.length > 0,
              }) ? (
                <Button asChild variant="outline">
                  <Link href={`/cotizaciones-whatsapp/${quote.id}/editar`}>
                    <Pencil aria-hidden />
                    Editar
                  </Link>
                </Button>
              ) : null}
              <QuoteMessageButton
                message={message}
                phone={phone}
                autoOpen={justCreated}
              />
              {canDiscardQuote(quote.status) ? (
                <DiscardQuoteButton quoteId={quote.id} />
              ) : null}
              {quote.status === "descartada" ? (
                <ReopenQuoteButton quoteId={quote.id} />
              ) : null}
            </div>
          </header>

          <div className="flex items-baseline justify-between gap-2 border-t pt-4">
            <span className="text-muted-foreground text-sm">
              Total referencial
            </span>
            <span className="text-lg font-semibold tabular-nums">
              {formatCents(quote.totalCents)}
            </span>
          </div>

          {quote.status === "descartada" && quote.discardReason ? (
            <div className="space-y-1 border-t pt-4">
              <p className="text-muted-foreground text-xs font-medium">
                Descartada
              </p>
              <p className="text-sm whitespace-pre-line">
                {quote.discardReason}
              </p>
            </div>
          ) : null}

          {quote.notes ? (
            <div className="space-y-1 border-t pt-4">
              <p className="text-muted-foreground text-xs font-medium">
                Notas generales
              </p>
              <p className="text-sm whitespace-pre-line">{quote.notes}</p>
            </div>
          ) : null}

          {quote.restorations.length > 0 ? (
            <div
              className="space-y-1 border-t pt-4"
              data-testid="restauraciones-copiadas"
            >
              <p className="text-muted-foreground text-xs font-medium">
                Restauraciones creadas desde esta cotización
              </p>
              <ul className="flex flex-wrap gap-x-3 gap-y-1">
                {quote.restorations.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/restauraciones/${r.id}`}
                      className="text-sm underline underline-offset-4"
                    >
                      {r.code}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <div className="min-w-0 space-y-6">
          <UrlTabs initial="piezas" defaultValue={tab}>
            <TabsList>
              <TabsTrigger value="piezas">
                Piezas ({quote.items.length})
              </TabsTrigger>
              <TabsTrigger value="archivos">
                Archivos{files.length > 0 ? ` (${files.length})` : ""}
              </TabsTrigger>
              <TabsTrigger value="historial">Historial</TabsTrigger>
            </TabsList>
            <TabsContent value="piezas" className="space-y-3">
              <h2 className="text-heading flex items-center gap-2 font-semibold">
                <Gem aria-hidden className="text-primary size-4" />
                Piezas cotizadas{" "}
                <span className="text-muted-foreground font-normal">
                  ({quote.items.length})
                </span>
              </h2>
              <QuoteItemsTable
                quoteCode={quote.code}
                items={quote.items}
                photos={photos}
                serviceNames={serviceNames}
                totalCents={quote.totalCents}
              />
            </TabsContent>
            <TabsContent value="archivos">
              <FilesPanel
                owner={{ kind: "whatsappQuote", id: quote.id }}
                files={files}
                targets={fileTargets}
                canUpload
                currentUserId={user.id}
                isAdmin={user.role === "admin"}
                emptyText="Aún no hay fotos. Sube las que mandó el cliente por WhatsApp: pasan a la restauración al crearla."
              />
            </TabsContent>
            <TabsContent value="historial" className="space-y-6">
              <EntityHistorySection
                table="whatsapp_quotes"
                recordId={quote.id}
              />
            </TabsContent>
          </UrlTabs>
        </div>
      </div>
    </div>
  );
}
