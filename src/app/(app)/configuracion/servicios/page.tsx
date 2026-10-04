import type { Metadata } from "next";

import { CatalogManager } from "@/components/catalogs/catalog-manager";
import { requirePermission } from "@/server/auth";
import { listCatalog } from "@/server/catalogs";

export const metadata: Metadata = { title: "Servicios" };

export default async function ServiciosPage() {
  await requirePermission("configuracion.gestionar");
  return (
    <CatalogManager kind="services" items={await listCatalog("services")} />
  );
}
