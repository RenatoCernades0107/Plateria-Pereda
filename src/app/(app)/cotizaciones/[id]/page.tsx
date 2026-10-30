import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageBreadcrumb } from "@/components/page-breadcrumb";
import { PageHeader } from "@/components/page-header";
import { QuoteActions } from "@/components/quotes/quote-actions";
import { QuoteForm } from "@/components/quotes/quote-form";
import { QuotePdfButton } from "@/components/quotes/quote-pdf-button";
import { QuoteStatusBadge } from "@/components/quotes/quote-status-badge";
import { Button } from "@/components/ui/button";
import { can } from "@/domain/permissions";
import { limaDateOf } from "@/domain/quote";
import { quotePdfLineFromDraft, type QuotePdfData } from "@/domain/quote-pdf";
import { requirePermission } from "@/server/auth";
import { recordMetadata } from "@/server/page-titles";
import { getQuote } from "@/server/quotes/queries";
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
  const user = await requirePermission("cotizador.ver");
  // Logística la ve sin editarla, cambiar su estado ni exportarla.
  const canEdit = can(user.role, "cotizador.usar");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const quote = await getQuote(id);
  if (!quote) notFound();

  const draft = quote.status === "borrador";
  const canExportPdf = canEdit && quote.lines.length > 0;
  const company = await getSettings();
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
    deliveryDays: quote.deliveryDays,
    clientName,
    contactName: client.name,
    lines: quote.lines.map(quotePdfLineFromDraft),
    notes: quote.notes,
    terms: quote.terms,
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
              !canEdit
                ? "Solo lectura."
                : draft
                  ? "Borrador: se puede editar hasta emitirla."
                  : "Emitida: para cambiarla, duplícala."
            }
          />
          <div className="-mt-4 flex flex-wrap items-center gap-2 text-sm">
            <QuoteStatusBadge status={quote.displayStatus} />
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
            <QuotePdfButton data={pdfData} phone={client.phone} />
          ) : null}
          {canEdit ? (
            <QuoteActions id={quote.id} status={quote.status} />
          ) : null}
        </div>
      </div>
      <QuoteForm
        // Al cambiar de estado se reinicia con los datos guardados.
        key={`${quote.id}:${quote.status}`}
        quoteId={quote.id}
        readOnly={!draft || !canEdit}
        issueDate={quote.issueDate}
        canCreateClient={can(user.role, "clientes.editar")}
        initial={{
          client: quote.client,
          validityDays: String(quote.validityDays),
          paymentCondition: quote.paymentCondition,
          deliveryDays: String(quote.deliveryDays),
          notes: quote.notes,
          terms: quote.terms,
          lines: quote.lines,
        }}
      />
    </div>
  );
}
