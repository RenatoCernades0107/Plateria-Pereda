import type { Metadata } from "next";
import Link from "next/link";

import { AuditFiltersForm } from "@/components/audit/audit-filters-form";
import { AuditLogList, recordKey } from "@/components/audit/audit-log-list";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { AUDIT_ENTITIES } from "@/domain/audit";
import { auditHref, parseAuditFilters } from "@/lib/audit-filters";
import { createClient } from "@/lib/supabase/server";
import { listAuditLog } from "@/server/audit";
import { requirePermission } from "@/server/auth";

export const metadata: Metadata = { title: "Auditoría" };

export default async function AuditoriaPage({
  searchParams,
}: PageProps<"/auditoria">) {
  await requirePermission("auditoria.ver");
  const filters = parseAuditFilters(await searchParams);

  const supabase = await createClient();
  const [{ entries, total, pages }, profiles] = await Promise.all([
    listAuditLog(filters),
    supabase.from("profiles").select("id, full_name").order("full_name"),
  ]);
  if (profiles.error) throw profiles.error;

  const actors = profiles.data.map((p) => ({
    value: p.id,
    label: p.full_name,
  }));
  const recordLabels = Object.fromEntries(
    profiles.data.map((p) => [recordKey("profiles", p.id), p.full_name]),
  );
  const entities = Object.entries(AUDIT_ENTITIES).map(([value, e]) => ({
    value,
    label: e.label,
  }));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Auditoría"
        description="Quién cambió qué y cuándo en todo el sistema."
      />
      <AuditFiltersForm
        // Al navegar con otros filtros el formulario se reinicia con los de la URL.
        key={auditHref(filters)}
        filters={filters}
        actors={actors}
        entities={entities}
      />
      <AuditLogList entries={entries} recordLabels={recordLabels} />
      <nav
        aria-label="Paginación"
        className="flex items-center justify-between gap-2 text-sm"
      >
        <span className="text-muted-foreground">
          {total === 1 ? "1 cambio" : `${total} cambios`} · Página{" "}
          {filters.page} de {pages}
        </span>
        <div className="flex gap-2">
          {filters.page > 1 ? (
            <Button asChild variant="outline" size="sm">
              <Link href={auditHref({ ...filters, page: filters.page - 1 })}>
                Anterior
              </Link>
            </Button>
          ) : null}
          {filters.page < pages ? (
            <Button asChild variant="outline" size="sm">
              <Link href={auditHref({ ...filters, page: filters.page + 1 })}>
                Siguiente
              </Link>
            </Button>
          ) : null}
        </div>
      </nav>
    </div>
  );
}
