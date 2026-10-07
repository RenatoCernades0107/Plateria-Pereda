import { ArrowLeft, Printer } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { PrintButton } from "@/components/workshops/print-button";
import { WorkshopPiecesTable } from "@/components/workshops/workshop-pieces-table";
import { can } from "@/domain/permissions";
import {
  parseWorkshopPiecesView,
  workshopPiecesHref,
} from "@/domain/workshop-pieces";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/server/auth";
import { listWorkshopPieces } from "@/server/workshop-pieces";

export const metadata: Metadata = { title: "Piezas del taller" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function TallerPiezasPage({
  params,
  searchParams,
}: PageProps<"/talleres/[id]/piezas">) {
  const user = await requirePermission("talleres.gestionar");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const view = parseWorkshopPiecesView(await searchParams);

  const supabase = await createClient();
  const { data: workshop, error } = await supabase
    .from("workshops")
    .select("id, name")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!workshop) notFound();

  const { items, total, pages, totalCostCents } = await listWorkshopPieces(
    id,
    view,
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4 print:hidden">
        <PageHeader
          title={`Piezas en ${workshop.name}`}
          description="Piezas asignadas a este taller que aún no vuelven al cliente. Toma captura de la tabla o descárgala en PDF para enviarla al proveedor."
        />
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/talleres">
              <ArrowLeft />
              Talleres
            </Link>
          </Button>
          {pages > 1 && !view.all ? (
            // El PDF lleva todas las piezas, no solo la página que se ve.
            <Button asChild>
              <Link href={workshopPiecesHref(id, { all: true, print: true })}>
                <Printer />
                Descargar PDF
              </Link>
            </Button>
          ) : (
            <PrintButton autoPrint={view.print} />
          )}
        </div>
      </div>
      {/* Solo al imprimir: el título del documento para el proveedor. */}
      <h1 className="text-heading hidden text-xl font-semibold print:block">
        Piezas para {workshop.name}
      </h1>

      <WorkshopPiecesTable
        pieces={items}
        totalCostCents={totalCostCents}
        canEditCost={can(user.role, "piezas.costo-servicio")}
      />

      <nav
        aria-label="Paginación"
        className="flex items-center justify-between gap-2 text-sm print:hidden"
      >
        <span className="text-muted-foreground">
          {total === 1 ? "1 pieza" : `${total} piezas`}
          {view.all ? "" : ` · Página ${view.page} de ${pages}`}
        </span>
        <div className="flex gap-2">
          {view.all ? (
            <Button asChild variant="outline" size="sm">
              <Link href={workshopPiecesHref(id)}>Ver por páginas</Link>
            </Button>
          ) : (
            <>
              {view.page > 1 ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={workshopPiecesHref(id, { page: view.page - 1 })}>
                    Anterior
                  </Link>
                </Button>
              ) : null}
              {view.page < pages ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={workshopPiecesHref(id, { page: view.page + 1 })}>
                    Siguiente
                  </Link>
                </Button>
              ) : null}
              {pages > 1 ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={workshopPiecesHref(id, { all: true })}>
                    Ver todas (para PDF)
                  </Link>
                </Button>
              ) : null}
            </>
          )}
        </div>
      </nav>
    </div>
  );
}
