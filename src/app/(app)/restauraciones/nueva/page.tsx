import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { RestorationForm } from "@/components/restorations/restoration-form";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/server/auth";
import { listCatalog } from "@/server/catalogs";
import { getSettings } from "@/server/settings";
import { quoteForForm } from "@/server/whatsapp-quotes/form-data";
import { getWhatsappQuote } from "@/server/whatsapp-quotes/queries";

export const metadata: Metadata = { title: "Nueva restauración" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Registro de una restauración (o de una cotización de WhatsApp con la casilla). Con
 * `?cotizacion=<id>` crea la restauración desde esa cotización (P46).
 */
export default async function NuevaRestauracionPage({
  searchParams,
}: PageProps<"/restauraciones/nueva">) {
  await requirePermission("restauraciones.editar");
  const { cotizacion, whatsapp } = await searchParams;
  const quoteId = typeof cotizacion === "string" ? cotizacion : null;
  if (quoteId !== null && !UUID.test(quoteId)) notFound();
  if (quoteId) await requirePermission("cotizaciones-whatsapp.usar");
  const quote = quoteId ? await getWhatsappQuote(quoteId) : null;
  if (quoteId && !quote) notFound();
  const supabase = await createClient();
  const [settings, materials, services, workshops] = await Promise.all([
    getSettings(),
    listCatalog("materials", { onlyActive: true }),
    listCatalog("services", { onlyActive: true }),
    supabase
      .from("workshops")
      .select("id, name")
      .eq("active", true)
      .order("name"),
  ]);
  if (workshops.error) throw workshops.error;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={
          quote
            ? `Crear restauración desde ${quote.code}`
            : "Nueva restauración"
        }
        description={
          quote
            ? "Elige las piezas que el cliente pidió y el estado al que pasa cada una."
            : "Registra las piezas que deja el cliente y genera la cotización."
        }
      />
      <RestorationForm
        mode={
          quote
            ? { kind: "copia", quote: quoteForForm(quote) }
            : { kind: "nueva", whatsapp: whatsapp === "1" }
        }
        defaultDepositPercent={settings.depositPercent}
        workshops={workshops.data}
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
