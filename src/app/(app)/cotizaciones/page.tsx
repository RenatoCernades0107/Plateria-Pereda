import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { QuotesFiltersForm } from "@/components/quotes/quotes-filters-form";
import { QuotesList } from "@/components/quotes/quotes-list";
import { Button } from "@/components/ui/button";
import { parseQuoteFilters, quoteFiltersHref } from "@/domain/quote-filters";
import { requirePermission } from "@/server/auth";
import { getClientName, listQuotes } from "@/server/quotes/queries";

export const metadata: Metadata = { title: "Cotizaciones" };

export default async function CotizacionesPage({
  searchParams,
}: PageProps<"/cotizaciones">) {
  await requirePermission("cotizador.usar");
  const filters = parseQuoteFilters(await searchParams);
  const [{ quotes, total, pages }, clientName] = await Promise.all([
    listQuotes(filters),
    filters.clientId ? getClientName(filters.clientId) : null,
  ]);
  const filtered = quoteFiltersHref(filters, { page: 1 }) !== "/cotizaciones";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title="Cotizaciones"
          description="Cotizaciones de productos personalizados del catálogo de Shopify."
        />
        <Button asChild>
          <Link href="/cotizaciones/nueva">
            <Plus aria-hidden />
            Nueva cotización
          </Link>
        </Button>
      </div>
      <QuotesFiltersForm
        // Al navegar con otros filtros el formulario se reinicia con los de la URL.
        key={quoteFiltersHref(filters)}
        filters={filters}
        clientName={clientName}
      />
      <QuotesList
        quotes={quotes}
        emptyMessage={
          filtered
            ? "No hay cotizaciones con esos filtros."
            : "Aún no hay cotizaciones."
        }
      />
      <nav
        aria-label="Paginación"
        className="flex items-center justify-between gap-2 text-sm"
      >
        <span className="text-muted-foreground">
          {total === 1 ? "1 cotización" : `${total} cotizaciones`} · Página{" "}
          {filters.page} de {pages}
        </span>
        <div className="flex gap-2">
          {filters.page > 1 ? (
            <Button asChild variant="outline" size="sm">
              <Link
                href={quoteFiltersHref(filters, { page: filters.page - 1 })}
              >
                Anterior
              </Link>
            </Button>
          ) : null}
          {filters.page < pages ? (
            <Button asChild variant="outline" size="sm">
              <Link
                href={quoteFiltersHref(filters, { page: filters.page + 1 })}
              >
                Siguiente
              </Link>
            </Button>
          ) : null}
        </div>
      </nav>
    </div>
  );
}
