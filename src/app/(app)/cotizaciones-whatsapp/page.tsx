import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState, FilteredEmptyState } from "@/components/empty-state";
import { FilterChips } from "@/components/filter-chips";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import { Pagination } from "@/components/pagination";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { WhatsappQuotesFiltersForm } from "@/components/whatsapp-quotes/whatsapp-quotes-filters-form";
import { WhatsappQuotesList } from "@/components/whatsapp-quotes/whatsapp-quotes-list";
import {
  parseWhatsappQuoteFilters,
  WHATSAPP_QUOTE_STATUSES,
  whatsappQuoteFiltersHref,
  whatsappQuoteStatusChips,
} from "@/domain/whatsapp-quotes";
import { requirePermission } from "@/server/auth";
import { listWhatsappQuotes } from "@/server/whatsapp-quotes/queries";

export const metadata: Metadata = { title: "Cotizaciones de WhatsApp" };

/**
 * Listado propio de las cotizaciones de WhatsApp (P46): sin restauraciones, con el
 * mismo aspecto que el de las restauraciones (chips por estado, filtros, tabla
 * ordenable y tarjetas en el celular).
 */
export default async function CotizacionesWhatsappPage({
  searchParams,
}: PageProps<"/cotizaciones-whatsapp">) {
  await requirePermission("cotizaciones-whatsapp.usar");
  const filters = parseWhatsappQuoteFilters(await searchParams);
  // Contadores de los chips: lo que daría cada estado con los demás filtros.
  const [{ items, total, pages }, ...statusTotals] = await Promise.all([
    listWhatsappQuotes(filters),
    ...WHATSAPP_QUOTE_STATUSES.map((status) =>
      filters.status === status
        ? null
        : listWhatsappQuotes({ ...filters, status, page: 1 }, { limit: 1 }),
    ),
  ]);
  const counts = Object.fromEntries(
    WHATSAPP_QUOTE_STATUSES.map((status, i) => [
      status,
      statusTotals[i]?.total ?? total,
    ]),
  );
  const filtered =
    whatsappQuoteFiltersHref(filters, {
      page: 1,
      sort: "created_at",
      dir: "desc",
    }) !== "/cotizaciones-whatsapp";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          icon={<WhatsAppIcon className="text-whatsapp-strong size-6" />}
          title="Cotizaciones de WhatsApp"
          description="Lo cotizado por WhatsApp, con las fotos que mandó el cliente, para volver a pedir piezas cuando confirme."
        />
        <Button asChild>
          <Link href="/restauraciones/nueva?whatsapp=1">
            <Plus aria-hidden />
            Nueva cotización
          </Link>
        </Button>
      </div>
      <FilterChips chips={whatsappQuoteStatusChips(filters, counts)} />
      <WhatsappQuotesFiltersForm filters={filters} />
      {/* Barra de la lista: cuántas hay. */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
        <p className="text-muted-foreground text-sm" data-testid="resumen">
          {total === 1 ? "1 cotización" : `${total} cotizaciones`}
        </p>
      </div>
      <WhatsappQuotesList
        quotes={items}
        filters={filters}
        now={new Date()}
        emptyMessage="Aún no hay cotizaciones de WhatsApp."
        empty={
          filtered ? (
            <FilteredEmptyState resetHref="/cotizaciones-whatsapp" />
          ) : (
            <EmptyState title="Aún no hay cotizaciones de WhatsApp." />
          )
        }
      />
      <Pagination
        page={filters.page}
        pages={pages}
        total={total}
        noun={["cotización", "cotizaciones"]}
        hrefFor={(page) => whatsappQuoteFiltersHref(filters, { page })}
      />
    </div>
  );
}
