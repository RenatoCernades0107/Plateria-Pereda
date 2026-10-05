import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { RestorationForm } from "@/components/restorations/restoration-form";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/server/auth";
import { listCatalog } from "@/server/catalogs";
import { getSettings } from "@/server/settings";

export const metadata: Metadata = { title: "Nueva restauración" };

export default async function NuevaRestauracionPage() {
  await requirePermission("restauraciones.editar");
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
        title="Nueva restauración"
        description="Registra las piezas que deja el cliente y genera la cotización."
      />
      <RestorationForm
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
