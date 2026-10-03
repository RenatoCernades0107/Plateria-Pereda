import type { Metadata } from "next";

import { CatalogManager } from "@/components/catalogs/catalog-manager";
import { requirePermission } from "@/server/auth";
import { listCatalog } from "@/server/catalogs";

export const metadata: Metadata = { title: "Métodos de pago" };

export default async function MetodosDePagoPage() {
  await requirePermission("configuracion.gestionar");
  return (
    <CatalogManager
      kind="payment_methods"
      items={await listCatalog("payment_methods")}
    />
  );
}
