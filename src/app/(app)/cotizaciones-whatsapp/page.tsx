import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState, FilteredEmptyState } from "@/components/empty-state";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import { Pagination } from "@/components/pagination";
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
          icon={<WhatsAppIcon className="text-whatsapp-strong size-6" />}
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
      <WhatsappQuotesFiltersForm filters={filters} />
      <WhatsappQuotesList
        quotes={items}
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
