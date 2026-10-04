import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { can } from "@/domain/permissions";
import { requirePermission } from "@/server/auth";

export const metadata: Metadata = { title: "Restauraciones" };

export default async function RestauracionesPage() {
  const user = await requirePermission("restauraciones.ver");
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <PageHeader
        title="Restauraciones"
        description="El listado con filtros llega en la Fase 12."
      />
      {can(user.role, "restauraciones.editar") ? (
        <Button asChild>
          <Link href="/restauraciones/nueva">
            <Plus />
            Nueva restauración
          </Link>
        </Button>
      ) : null}
    </div>
  );
}
