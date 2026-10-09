import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { QuoteForm } from "@/components/quotes/quote-form";
import { Button } from "@/components/ui/button";
import { can } from "@/domain/permissions";
import { requirePermission } from "@/server/auth";
import { getSettings } from "@/server/settings";

export const metadata: Metadata = { title: "Nueva cotización" };

export default async function NuevaCotizacionPage() {
  const user = await requirePermission("cotizador.usar");
  const settings = await getSettings();
  return (
    <div className="space-y-4">
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
        initial={{
          client: null,
          validityDays: String(settings.quoteValidityDays),
          pricesIncludeIgv: "",
          notes: "",
          terms: settings.terms,
          lines: [],
        }}
      />
    </div>
  );
}
