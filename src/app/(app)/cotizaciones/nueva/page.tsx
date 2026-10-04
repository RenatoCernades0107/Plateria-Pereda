import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { QuoteForm } from "@/components/quotes/quote-form";
import { requirePermission } from "@/server/auth";

export const metadata: Metadata = { title: "Nueva cotización" };

export default async function NuevaCotizacionPage() {
  await requirePermission("cotizador.usar");
  return (
    <div className="space-y-4">
      <PageHeader
        title="Nueva cotización"
        description="Productos del catálogo de Shopify con su personalización."
      />
      <QuoteForm />
    </div>
  );
}
