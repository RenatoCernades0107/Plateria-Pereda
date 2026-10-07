import Link from "next/link";

import { RestorationsList } from "@/components/restorations/restorations-list";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WhatsappQuotesList } from "@/components/whatsapp-quotes/whatsapp-quotes-list";
import {
  parseRestorationFilters,
  restorationFiltersHref,
} from "@/domain/restoration-filters";
import {
  parseWhatsappQuoteFilters,
  whatsappQuoteFiltersHref,
} from "@/domain/whatsapp-quotes";
import type { RestorationListItem } from "@/server/restorations/queries";
import type { WhatsappQuoteListItem } from "@/server/whatsapp-quotes/queries";

/**
 * Restauraciones y cotizaciones de WhatsApp del cliente en pestañas separadas: nunca
 * en la misma lista (P46).
 */
export function ClientWorkTabs({
  clientId,
  restorations,
  restorationsTotal,
  quotes,
  quotesTotal,
  showMoney,
  showQuotes,
}: {
  clientId: string;
  restorations: RestorationListItem[];
  restorationsTotal: number;
  quotes: WhatsappQuoteListItem[];
  quotesTotal: number;
  showMoney: boolean;
  /** Solo admin y ventas ven las cotizaciones de WhatsApp. */
  showQuotes: boolean;
}) {
  const restorationFilters = {
    ...parseRestorationFilters({}),
    clientId,
  };
  const quoteFilters = { ...parseWhatsappQuoteFilters({}), clientId };
  return (
    <Tabs defaultValue="restauraciones">
      <TabsList>
        <TabsTrigger value="restauraciones">
          Restauraciones ({restorationsTotal})
        </TabsTrigger>
        {showQuotes ? (
          <TabsTrigger value="cotizaciones-whatsapp">
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
      {showQuotes ? (
        <TabsContent value="cotizaciones-whatsapp" className="space-y-2">
          <WhatsappQuotesList
            quotes={quotes}
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
