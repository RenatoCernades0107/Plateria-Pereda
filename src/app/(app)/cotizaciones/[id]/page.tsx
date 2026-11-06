import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageBreadcrumb } from "@/components/page-breadcrumb";
import { PageHeader } from "@/components/page-header";
import { QuoteActions } from "@/components/quotes/quote-actions";
import { QuoteDeliveryButton } from "@/components/quotes/quote-delivery-dialog";
import { QuoteForm } from "@/components/quotes/quote-form";
import { QuotePdfButton } from "@/components/quotes/quote-pdf-button";
import { QuoteStatusBadge } from "@/components/quotes/quote-status-badge";
import { QuoteWorkshopNotes } from "@/components/quotes/quote-workshop-notes";
import { Button } from "@/components/ui/button";
import { can } from "@/domain/permissions";
import { DEFAULT_QUOTE_CREDIT_DAYS, limaDateOf } from "@/domain/quote";
import { quotePdfLineFromDraft, type QuotePdfData } from "@/domain/quote-pdf";
import type { WorkshopQuote } from "@/domain/quote-workshop-pdf";
import { requirePermission } from "@/server/auth";
import { recordMetadata } from "@/server/page-titles";
import { getQuote, listQuoteIssuers } from "@/server/quotes/queries";
import { getSettings } from "@/server/settings";

export async function generateMetadata({
  params,
}: PageProps<"/cotizaciones/[id]">): Promise<Metadata> {
  return recordMetadata("quote", (await params).id, "Cotización");
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CotizacionPage({
  params,
}: PageProps<"/cotizaciones/[id]">) {
  const user = await requirePermission("cotizador.usar");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const quote = await getQuote(id);
  if (!quote) notFound();

  const draft = quote.status === "borrador";
  // Una anulada (emitida por error) no se exporta ni se comparte; para el taller, sí.
  const canExportPdf = quote.lines.length > 0;
  const voided = quote.status === "anulada";
  const [company, activeIssuers] = await Promise.all([
    getSettings(),
    listQuoteIssuers({ onlyActive: true }),
  ]);
  // La actual se ofrece aunque se haya desactivado.
  const issuers =
    quote.issuer && !activeIssuers.some((i) => i.id === quote.issuer!.id)
      ? [...activeIssuers, quote.issuer]
      : activeIssuers;
  const client = quote.client;
  // "Sr(es):" es la empresa cuando se cotiza a un contacto; "Contacto:" es quien
  // atiende (el mismo nombre si no hay un contacto aparte, como en la cotización
  // impresa de la tienda).
  const clientName =
    client.source === "local" && client.kind === "contacto"
      ? client.companyName
      : client.name;
  const pdfData: QuotePdfData = {
    company: {
      name: company.legalName || "Platería Pereda",
      address: company.address,
    },
    code: quote.code,
    issueDate: quote.issueDate ?? limaDateOf(new Date()),
    validityDays: quote.validityDays,
    paymentCondition: quote.paymentCondition,
    creditDays: quote.creditDays,
    issuer: quote.issuer,
    deliveryDays: quote.deliveryDays,
    clientName,
    contactName: client.name,
    clientDocument: quote.pdfClient.document,
    phone: quote.pdfClient.phone,
    lines: quote.lines.map(quotePdfLineFromDraft),
    applyIgv: quote.applyIgv,
    notes: quote.notes,
    terms: quote.terms,
  };
  // Orden para taller: sin precios ni contacto, con las instrucciones para el taller.
  const workshop: WorkshopQuote = {
    id: quote.id,
    code: quote.code,
    status: quote.displayStatus,
    clientName,
    issueDate: quote.issueDate,
    deliveryDate: quote.deliveryDate,
    supplierDeliveryDate: quote.supplierDeliveryDate,
    notes: quote.workshopNotes,
    lines: quote.lines.map((line) => ({
      id: line.key,
      title: line.title,
      variantTitle: line.variantTitle,
      sku: line.sku,
      customization: line.customization,
      quantity: Number(line.quantity),
      image: line.referenceImageUrl ?? line.imageUrl,
    })),
  };

  return (
    <div className="max-w-3xl space-y-4">
      {quote.code ? <PageBreadcrumb label={quote.code} /> : null}
      {/* En pantallas grandes la ruta de navegación del encabezado ya lleva atrás. */}
      <Button asChild variant="ghost" size="sm" className="-ml-2 md:hidden">
        <Link href="/cotizaciones">
          <ArrowLeft aria-hidden />
          Cotizaciones
        </Link>
      </Button>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <PageHeader
            title={`Cotización ${quote.code}`}
            description={
              draft
                ? "Borrador: se puede editar hasta emitirla."
                : quote.status === "anulada"
                  ? "Anulada: se emitió por error. Para corregirla, duplícala."
                  : "Emitida: para cambiarla, duplícala."
            }
          />
          <div className="-mt-4 flex flex-wrap items-center gap-2 text-sm">
            <QuoteStatusBadge status={quote.displayStatus} />
            {quote.status === "aceptada" ? (
              <QuoteDeliveryButton
                quoteId={quote.id}
                deliveryDays={quote.deliveryDays}
                deliveryDate={quote.deliveryDate}
                supplierDeliveryDate={quote.supplierDeliveryDate}
              />
            ) : null}
            {quote.duplicatedFrom ? (
              <span className="text-muted-foreground">
                Copia de{" "}
                <Link
                  href={`/cotizaciones/${quote.duplicatedFrom.id}`}
                  className="underline-offset-4 hover:underline"
                >
                  {quote.duplicatedFrom.code}
                </Link>
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canExportPdf ? (
            <QuotePdfButton
              data={pdfData}
              phone={quote.pdfClient.phone}
              clientId={client.source === "local" ? client.clientId : null}
              contactId={
                client.source === "local" && client.kind === "contacto"
                  ? client.contactId
                  : null
              }
              canEditClient={can(user.role, "clientes.editar")}
              workshop={workshop}
              workshopOnly={voided}
            />
          ) : null}
          <QuoteActions
            id={quote.id}
            status={quote.status}
            deliveryDays={quote.deliveryDays}
          />
        </div>
      </div>
      <QuoteWorkshopNotes
        key={`${quote.id}:${quote.workshopNotes}`}
        quoteId={quote.id}
        notes={quote.workshopNotes}
      />
      <QuoteForm
        // Al cambiar de estado se reinicia con los datos guardados.
        key={`${quote.id}:${quote.status}`}
        quoteId={quote.id}
        readOnly={!draft}
        issueDate={quote.issueDate}
        canCreateClient={can(user.role, "clientes.editar")}
        issuers={issuers}
        initial={{
          client: quote.client,
          validityDays: String(quote.validityDays),
          paymentCondition: quote.paymentCondition,
          creditDays: String(quote.creditDays ?? DEFAULT_QUOTE_CREDIT_DAYS),
          issuerId: quote.issuer?.id ?? null,
          deliveryDays: String(quote.deliveryDays),
          applyIgv: quote.applyIgv,
          notes: quote.notes,
          terms: quote.terms,
          lines: quote.lines,
        }}
      />
    </div>
  );
}
