import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState, FilteredEmptyState } from "@/components/empty-state";
import { Pagination } from "@/components/pagination";
import { PageHeader } from "@/components/page-header";
import { QuotesFiltersForm } from "@/components/quotes/quotes-filters-form";
import { QuotesList } from "@/components/quotes/quotes-list";
import { TrackingFiltersForm } from "@/components/quotes/tracking-filters-form";
import { TrackingQuotesList } from "@/components/quotes/tracking-quotes-list";
import { Button } from "@/components/ui/button";
import { can } from "@/domain/permissions";
import { parseQuoteFilters, quoteFiltersHref } from "@/domain/quote-filters";
import {
  parseTrackingFilters,
  trackingFiltersHref,
} from "@/domain/quote-tracking-filters";
import { requirePermission } from "@/server/auth";
import {
  getClientName,
  listQuotes,
  listTrackingQuotes,
  listWorkshopOptions,
} from "@/server/quotes/queries";

export const metadata: Metadata = { title: "Cotizaciones" };

export default async function CotizacionesPage({
  searchParams,
}: PageProps<"/cotizaciones">) {
  const user = await requirePermission("cotizaciones.seguimiento");
  const params = await searchParams;

  // Logística no usa el cotizador: sigue las aprobadas (sin dinero) para asignar el
  // taller y la ubicación del trabajo.
  if (!can(user.role, "cotizador.usar")) {
    const filters = parseTrackingFilters(params);
    const [{ quotes, total, pages }, workshops] = await Promise.all([
      listTrackingQuotes(filters),
      listWorkshopOptions(),
    ]);
    const filtered =
      trackingFiltersHref(filters, { page: 1 }) !== "/cotizaciones";
    return (
      <div className="space-y-4">
        <PageHeader
          title="Cotizaciones aprobadas"
          description="Cotizaciones aceptadas y facturadas: asigna el taller y sigue dónde está el trabajo."
        />
        <TrackingFiltersForm filters={filters} workshops={workshops} />
        <TrackingQuotesList
          quotes={quotes}
          empty={
            filtered ? (
              <FilteredEmptyState resetHref="/cotizaciones" />
            ) : (
              <EmptyState title="Aún no hay cotizaciones aprobadas." />
            )
          }
        />
        <Pagination
          page={filters.page}
          pages={pages}
          total={total}
          noun={["cotización", "cotizaciones"]}
          hrefFor={(page) => trackingFiltersHref(filters, { page })}
        />
      </div>
    );
  }

  const filters = parseQuoteFilters(params);
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
      <QuotesFiltersForm filters={filters} clientName={clientName} />
      <QuotesList
        selectable
        quotes={quotes}
        emptyMessage="Aún no hay cotizaciones."
        empty={
          filtered ? (
            <FilteredEmptyState resetHref="/cotizaciones" />
          ) : (
            <EmptyState title="Aún no hay cotizaciones." />
          )
        }
      />
      <Pagination
        page={filters.page}
        pages={pages}
        total={total}
        noun={["cotización", "cotizaciones"]}
        hrefFor={(page) => quoteFiltersHref(filters, { page })}
      />
    </div>
  );
}
