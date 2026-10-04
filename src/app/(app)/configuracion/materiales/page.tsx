import type { Metadata } from "next";

import { CatalogManager } from "@/components/catalogs/catalog-manager";
import { requirePermission } from "@/server/auth";
import { listCatalog } from "@/server/catalogs";

export const metadata: Metadata = { title: "Materiales" };

export default async function MaterialesPage() {
  await requirePermission("configuracion.gestionar");
  return (
    <CatalogManager kind="materials" items={await listCatalog("materials")} />
  );
}
