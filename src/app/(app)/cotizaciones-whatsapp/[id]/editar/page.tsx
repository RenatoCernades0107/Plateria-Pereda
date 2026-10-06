import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { RestorationForm } from "@/components/restorations/restoration-form";
import { canEditQuote } from "@/domain/whatsapp-quotes";
import { requirePermission } from "@/server/auth";
import { listCatalog } from "@/server/catalogs";
import { getSettings } from "@/server/settings";
import { quoteForForm } from "@/server/whatsapp-quotes/form-data";
import { getWhatsappQuote } from "@/server/whatsapp-quotes/queries";

export const metadata: Metadata = { title: "Editar cotización de WhatsApp" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Edición de una cotización: solo hasta la primera copia (P46, Q8). */
export default async function EditarCotizacionWhatsappPage({
  params,
}: PageProps<"/cotizaciones-whatsapp/[id]/editar">) {
  await requirePermission("cotizaciones-whatsapp.usar");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const quote = await getWhatsappQuote(id);
  if (!quote) notFound();
  if (
    !canEditQuote({
      status: quote.status,
      everCopied: quote.restorations.length > 0,
    })
  ) {
    redirect(`/cotizaciones-whatsapp/${id}`);
  }
  const [settings, materials, services] = await Promise.all([
    getSettings(),
    listCatalog("materials", { onlyActive: true }),
    listCatalog("services", { onlyActive: true }),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={`Editar ${quote.code}`}
        description="Se puede editar hasta que alguna pieza se pase a una restauración."
      />
      <RestorationForm
        mode={{ kind: "editar-cotizacion", quote: quoteForForm(quote) }}
        defaultDepositPercent={settings.depositPercent}
        workshops={[]}
        materials={materials.map(({ id, name, price }) => ({
          id,
          name,
          price,
        }))}
        services={services.map(({ id, name, price }) => ({ id, name, price }))}
      />
    </div>
  );
}
