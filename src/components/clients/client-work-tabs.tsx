import { FileText } from "lucide-react";
import Link from "next/link";

import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import { QuotesList } from "@/components/quotes/quotes-list";
import { RestorationsList } from "@/components/restorations/restorations-list";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WhatsappQuotesList } from "@/components/whatsapp-quotes/whatsapp-quotes-list";
import { parseQuoteFilters, quoteFiltersHref } from "@/domain/quote-filters";
import {
  parseRestorationFilters,
  restorationFiltersHref,
} from "@/domain/restoration-filters";
import {
  parseWhatsappQuoteFilters,
  whatsappQuoteFiltersHref,
} from "@/domain/whatsapp-quotes";
import type { QuoteListItem } from "@/server/quotes/queries";
import type { RestorationListItem } from "@/server/restorations/queries";
import type { WhatsappQuoteListItem } from "@/server/whatsapp-quotes/queries";

/**
 * Restauraciones, cotizaciones personalizadas y cotizaciones de WhatsApp del cliente
 * en pestañas separadas: nunca en la misma lista (P46).
 */
export function ClientWorkTabs({
  clientId,
  restorations,
  restorationsTotal,
  quotes,
  quotesTotal,
  showMoney,
  showQuotes,
  customQuotes,
  customQuotesTotal,
  showCustomQuotes,
}: {
  clientId: string;
  restorations: RestorationListItem[];
  restorationsTotal: number;
  quotes: WhatsappQuoteListItem[];
  quotesTotal: number;
  showMoney: boolean;
  /** Solo admin y ventas ven las cotizaciones de WhatsApp. */
  showQuotes: boolean;
  /** Cotizaciones del cotizador de productos personalizados. */
  customQuotes: QuoteListItem[];
  customQuotesTotal: number;
  /** Solo quien usa el cotizador (admin y ventas) las ve. */
  showCustomQuotes: boolean;
}) {
  const restorationFilters = {
    ...parseRestorationFilters({}),
    clientId,
  };
  const quoteFilters = { ...parseWhatsappQuoteFilters({}), clientId };
  const customQuoteFilters = { ...parseQuoteFilters({}), clientId };
  return (
    <Tabs defaultValue="restauraciones">
      {/* Con tres pestañas no entra en un celular: se desliza dentro de la barra.
          overflow-y-hidden: el subrayado (::after) de cada pestaña sobresale 5px
          por debajo y, con overflow-x-auto, abría una barra vertical. */}
      <TabsList className="max-w-full justify-start overflow-x-auto overflow-y-hidden">
        <TabsTrigger value="restauraciones">
          Restauraciones ({restorationsTotal})
        </TabsTrigger>
        {showCustomQuotes ? (
          <TabsTrigger value="cotizaciones">
            <FileText />
            Cotizaciones personalizadas ({customQuotesTotal})
          </TabsTrigger>
        ) : null}
        {showQuotes ? (
          <TabsTrigger value="cotizaciones-whatsapp">
            <WhatsAppIcon className="text-whatsapp-strong" />
            Cotizaciones de WhatsApp ({quotesTotal})
          </TabsTrigger>
        ) : null}
      </TabsList>
      <TabsContent value="restauraciones" className="space-y-2">
        <RestorationsList
          items={restorations}
          filters={restorationFilters}
          showMoney={showMoney}
          emptyMessage="El cliente aún no tiene restauraciones."
        />
        {restorationsTotal > restorations.length ? (
          <Button asChild variant="link" className="px-0">
            <Link href={restorationFiltersHref(restorationFilters)}>
              Ver todas las restauraciones
            </Link>
          </Button>
        ) : null}
      </TabsContent>
      {showCustomQuotes ? (
        <TabsContent value="cotizaciones" className="space-y-2">
          <QuotesList
            quotes={customQuotes}
            emptyMessage="El cliente no tiene cotizaciones personalizadas."
          />
          {customQuotesTotal > customQuotes.length ? (
            <Button asChild variant="link" className="px-0">
              <Link href={quoteFiltersHref(customQuoteFilters)}>
                Ver todas las cotizaciones personalizadas
              </Link>
            </Button>
          ) : null}
        </TabsContent>
      ) : null}
      {showQuotes ? (
        <TabsContent value="cotizaciones-whatsapp" className="space-y-2">
          <WhatsappQuotesList
            quotes={quotes}
            filters={quoteFilters}
            now={new Date()}
            emptyMessage="El cliente no tiene cotizaciones de WhatsApp."
          />
          {quotesTotal > quotes.length ? (
            <Button asChild variant="link" className="px-0">
              <Link href={whatsappQuoteFiltersHref(quoteFilters)}>
                Ver todas las cotizaciones
              </Link>
            </Button>
          ) : null}
        </TabsContent>
      ) : null}
    </Tabs>
  );
}
