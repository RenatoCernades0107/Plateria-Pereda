import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { QuoteActions } from "@/components/quotes/quote-actions";
import { QuoteForm } from "@/components/quotes/quote-form";
import { QuoteStatusBadge } from "@/components/quotes/quote-status-badge";
import { Button } from "@/components/ui/button";
import { can } from "@/domain/permissions";
import { requirePermission } from "@/server/auth";
import { getQuote } from "@/server/quotes/queries";

export const metadata: Metadata = { title: "Cotización" };

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

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
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
        <QuoteActions id={quote.id} status={quote.status} />
      </div>
      <QuoteForm
        // Al cambiar de estado se reinicia con los datos guardados.
        key={`${quote.id}:${quote.status}`}
        quoteId={quote.id}
        readOnly={!draft}
        issueDate={quote.issueDate}
        canCreateClient={can(user.role, "clientes.editar")}
        initial={{
          client: quote.client,
          validityDays: String(quote.validityDays),
          notes: quote.notes,
          terms: quote.terms,
          lines: quote.lines,
        }}
      />
    </div>
  );
}
