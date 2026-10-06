import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { WhatsappQuotesFiltersForm } from "@/components/whatsapp-quotes/whatsapp-quotes-filters-form";
import { WhatsappQuotesList } from "@/components/whatsapp-quotes/whatsapp-quotes-list";
import {
  parseWhatsappQuoteFilters,
  whatsappQuoteFiltersHref,
} from "@/domain/whatsapp-quotes";
import { requirePermission } from "@/server/auth";
import { listWhatsappQuotes } from "@/server/whatsapp-quotes/queries";

export const metadata: Metadata = { title: "Cotizaciones de WhatsApp" };

/** Listado propio de las cotizaciones de WhatsApp (P46): sin restauraciones. */
export default async function CotizacionesWhatsappPage({
  searchParams,
}: PageProps<"/cotizaciones-whatsapp">) {
  await requirePermission("cotizaciones-whatsapp.usar");
  const filters = parseWhatsappQuoteFilters(await searchParams);
  const { items, total, pages } = await listWhatsappQuotes(filters);
  const filtered =
    whatsappQuoteFiltersHref(filters, { page: 1 }) !== "/cotizaciones-whatsapp";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title="Cotizaciones de WhatsApp"
          description="Lo cotizado por WhatsApp, para volver a pedir piezas cuando el cliente confirme."
        />
        <Button asChild>
          <Link href="/restauraciones/nueva?whatsapp=1">
            <Plus aria-hidden />
            Nueva cotización
          </Link>
        </Button>
      </div>
      <WhatsappQuotesFiltersForm
        key={whatsappQuoteFiltersHref(filters)}
        filters={filters}
      />
      <WhatsappQuotesList
        quotes={items}
        now={new Date()}
        emptyMessage={
          filtered
            ? "No hay cotizaciones con esos filtros."
            : "Aún no hay cotizaciones de WhatsApp."
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
                href={whatsappQuoteFiltersHref(filters, {
                  page: filters.page - 1,
                })}
              >
                Anterior
              </Link>
            </Button>
          ) : null}
          {filters.page < pages ? (
            <Button asChild variant="outline" size="sm">
              <Link
                href={whatsappQuoteFiltersHref(filters, {
                  page: filters.page + 1,
                })}
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
