import type { Metadata } from "next";

import { CatalogManager } from "@/components/catalogs/catalog-manager";
import { requirePermission } from "@/server/auth";
import { listCatalog } from "@/server/catalogs";

export const metadata: Metadata = { title: "Sucursales" };

export default async function SucursalesPage() {
  await requirePermission("configuracion.gestionar");
  return (
    <CatalogManager kind="branches" items={await listCatalog("branches")} />
  );
}
