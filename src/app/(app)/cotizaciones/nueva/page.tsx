import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { QuoteForm } from "@/components/quotes/quote-form";
import { Button } from "@/components/ui/button";
import { can } from "@/domain/permissions";
import {
  DEFAULT_QUOTE_CREDIT_DAYS,
  DEFAULT_QUOTE_DELIVERY_DAYS,
  DEFAULT_QUOTE_PAYMENT_CONDITION,
} from "@/domain/quote";
import { requirePermission } from "@/server/auth";
import { listQuoteIssuers } from "@/server/quotes/queries";
import { getSettings } from "@/server/settings";

export const metadata: Metadata = { title: "Nueva cotización" };

export default async function NuevaCotizacionPage() {
  const user = await requirePermission("cotizador.usar");
  const [settings, issuers] = await Promise.all([
    getSettings(),
    listQuoteIssuers({ onlyActive: true }),
  ]);
  return (
    <div className="max-w-3xl space-y-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/cotizaciones">
          <ArrowLeft aria-hidden />
          Cotizaciones
        </Link>
      </Button>
      <PageHeader
        title="Nueva cotización"
        description="Productos del catálogo de Shopify con su personalización."
      />
      <QuoteForm
        canCreateClient={can(user.role, "clientes.editar")}
        issuers={issuers}
        initial={{
          client: null,
          validityDays: String(settings.quoteValidityDays),
          paymentCondition: DEFAULT_QUOTE_PAYMENT_CONDITION,
          creditDays: String(DEFAULT_QUOTE_CREDIT_DAYS),
          issuerId: null,
          deliveryDays: String(DEFAULT_QUOTE_DELIVERY_DAYS),
          // Por defecto se suma el IGV a los precios.
          applyIgv: true,
          notes: "",
          terms: settings.terms,
          lines: [],
        }}
      />
    </div>
  );
}
