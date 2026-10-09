import { ArrowLeft, Pencil, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EntityHistorySection } from "@/components/audit/entity-history-section";
import { QuoteMessageButton } from "@/components/restorations/quote-message-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DiscardQuoteButton,
  ReopenQuoteButton,
} from "@/components/whatsapp-quotes/quote-actions";
import { WhatsappQuoteStatusBadge } from "@/components/whatsapp-quotes/status-badge";
import { formatCents, PAYMENT_TYPE_LABELS } from "@/domain/money";
import { igvLabel } from "@/domain/igv";
import { formatPhone } from "@/domain/phone";
import { buildQuoteMessage } from "@/domain/whatsapp-quote";
import {
  canCopyQuote,
  canDiscardQuote,
  canEditQuote,
  quoteAge,
} from "@/domain/whatsapp-quotes";
import { formatDateTime } from "@/lib/format";
import { requirePermission } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { getWhatsappQuote } from "@/server/whatsapp-quotes/queries";

export const metadata: Metadata = { title: "Cotización de WhatsApp" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Detalle de una cotización de WhatsApp (P46): lo cotizado, qué piezas ya se
 * pidieron y en qué restauración, el mensaje para el cliente y las acciones.
 */
export default async function CotizacionWhatsappPage({
  params,
  searchParams,
}: PageProps<"/cotizaciones-whatsapp/[id]">) {
  await requirePermission("cotizaciones-whatsapp.usar");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const quote = await getWhatsappQuote(id);
  if (!quote) notFound();

  const justCreated = (await searchParams).registrada === "1";
  const settings = await getSettings();
  const name =
    quote.contact?.name || quote.client?.name || quote.customerName || "";
  const phone =
    quote.contact?.phone ??
    quote.client?.phone ??
    (quote.customerPhone || null);
  const message = buildQuoteMessage(settings.whatsappTemplate, {
    code: quote.code,
    clientName: name,
    pieces: quote.items.map((i) => ({
      description: i.description,
      service: i.serviceName || null,
      priceCents: i.priceCents,
      status: "registrada",
    })),
    pricesIncludeIgv: quote.pricesIncludeIgv,
    paymentType: quote.paymentType,
    depositPercent: quote.depositPercent ?? 0,
    terms: settings.terms,
  });
  const pendingCount = quote.items.filter((i) => !i.order).length;
  const now = new Date();

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/cotizaciones-whatsapp">
          <ArrowLeft />
          Cotizaciones de WhatsApp
        </Link>
      </Button>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-heading text-2xl font-semibold tracking-tight">
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
          <div className="flex flex-wrap items-center gap-2">
            <span data-testid="estado-cotizacion" className="contents">
              <WhatsappQuoteStatusBadge status={quote.status} />
            </span>
            <Badge variant="outline">
              {PAYMENT_TYPE_LABELS[quote.paymentType]}
              {quote.depositPercent ? ` (${quote.depositPercent} %)` : ""}
            </Badge>
            <Badge variant="outline" data-testid="igv">
              {igvLabel(quote.pricesIncludeIgv)}
            </Badge>
            <span className="text-muted-foreground text-sm">
              Cotizada {quoteAge(new Date(quote.createdAt), now)} (
              {formatDateTime(new Date(quote.createdAt))})
            </span>
          </div>
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

      {quote.status === "descartada" && quote.discardReason ? (
        <p className="rounded-md border p-3 text-sm">
          <span className="text-muted-foreground">Descartada: </span>
          {quote.discardReason}
        </p>
      ) : null}
      {quote.notes ? (
        <p className="rounded-md border p-3 text-sm whitespace-pre-line">
          {quote.notes}
        </p>
      ) : null}

      <section className="space-y-3" aria-labelledby="piezas-cotizadas">
        <div className="flex items-center justify-between gap-2">
          <h2
            id="piezas-cotizadas"
            className="text-heading text-lg font-semibold"
          >
            Piezas cotizadas
          </h2>
          <p
            className="font-medium tabular-nums"
            data-testid="total-cotizacion"
          >
            Total: {formatCents(quote.totalCents)}
          </p>
        </div>
        <ul className="divide-y rounded-lg border">
          {quote.items.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-start justify-between gap-2 p-3"
              data-testid={`item-${item.number}`}
            >
              <div className="min-w-0 space-y-0.5">
                <p className="break-words">
                  {item.number}. {item.description}
                </p>
                <p className="text-muted-foreground text-sm">
                  {[
                    item.serviceName && `Servicio: ${item.serviceName}`,
                    item.materialName && `Material: ${item.materialName}`,
                    item.measure && `Medida: ${item.measure}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {item.order ? (
                  <p className="text-sm">
                    Pedida en{" "}
                    <Link
                      href={`/restauraciones/${item.order.restorationId}`}
                      className="font-medium underline underline-offset-4"
                    >
                      {item.order.restorationCode}
                    </Link>
                  </p>
                ) : (
                  <Badge variant="outline">Pendiente</Badge>
                )}
              </div>
              <p className="font-medium tabular-nums">
                {formatCents(item.priceCents)}
              </p>
            </li>
          ))}
        </ul>
      </section>

      {quote.restorations.length > 0 ? (
        <section
          className="space-y-2"
          aria-labelledby="restauraciones-copiadas"
        >
          <h2
            id="restauraciones-copiadas"
            className="text-heading text-lg font-semibold"
          >
            Restauraciones creadas desde esta cotización
          </h2>
          <ul className="flex flex-wrap gap-2">
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
        </section>
      ) : null}

      <section className="space-y-3" aria-labelledby="historial">
        <h2 id="historial" className="text-heading text-lg font-semibold">
          Historial
        </h2>
        <EntityHistorySection table="whatsapp_quotes" recordId={quote.id} />
      </section>
    </div>
  );
}
