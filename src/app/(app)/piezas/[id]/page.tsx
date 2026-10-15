import { ArrowLeft, ClipboardList, Images } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageBreadcrumb } from "@/components/page-breadcrumb";
import { FileGallery } from "@/components/files/file-gallery";
import { FileUploader } from "@/components/files/file-uploader";
import {
  PIECE_ACCENT_CLASS,
  PieceEyebrow,
} from "@/components/restorations/guide-labels";
import {
  LogisticsPieceSummary,
  PieceTimelineStrip,
} from "@/components/restorations/piece-history";
import { PieceMoneyTiles } from "@/components/restorations/piece-money-tiles";
import { PieceStatusPanel } from "@/components/restorations/piece-status-actions";
import { RestorationStatusBadge } from "@/components/restorations/status-badges";
import { PieceWorkshopField } from "@/components/restorations/workshop-edit-button";
import { Button } from "@/components/ui/button";
import { toCents } from "@/domain/money";
import { can } from "@/domain/permissions";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/server/auth";
import { recordMetadata } from "@/server/page-titles";
import { listRestorationFiles } from "@/server/files/queries";
import { getBalanceDue } from "@/server/payments/queries";
import {
  getLogisticsInfo,
  getRestorationDetail,
  getStatusHistory,
} from "@/server/restorations/queries";

export async function generateMetadata({
  params,
}: PageProps<"/piezas/[id]">): Promise<Metadata> {
  return recordMetadata("piece", (await params).id, "Pieza");
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CARD_CLASS = "bg-card rounded-lg border p-4 shadow-xs sm:p-5";

/**
 * Detalle completo de una pieza (P55). En pantallas anchas, lo esencial cabe sin
 * desplazarse: a la izquierda (~40 %) las fotos; a la derecha (~60 %) la cabecera
 * (código, descripción, cliente y guía), el estado, las acciones, los montos y los
 * datos de la pieza. Debajo, lo secundario: la historia y la subida de archivos.
 * En el celular va en una columna: cabecera, acciones, montos, fotos y datos.
 */
export default async function PiezaDetallePage({
  params,
}: PageProps<"/piezas/[id]">) {
  const user = await requirePermission("restauraciones.ver");
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  // La vista operativa respeta lo que cada rol ve (logística no ve restauraciones pasadas).
  const { data: row, error } = await supabase
    .from("pieces_operational")
    .select("restoration_id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!row?.restoration_id) notFound();

  const canSeeMoney = can(user.role, "restauraciones.editar");
  const restoration = await getRestorationDetail(row.restoration_id, {
    withMoney: canSeeMoney,
  });
  const piece = restoration?.pieces.find((p) => p.id === id);
  if (!restoration || !piece) notFound();

  const canSeeCost = can(user.role, "piezas.costo-servicio");
  const [history, logistics, files, balanceDue, workshops, cost] =
    await Promise.all([
      canSeeMoney ? getStatusHistory(restoration.id) : Promise.resolve([]),
      canSeeMoney ? Promise.resolve(null) : getLogisticsInfo(restoration.id),
      listRestorationFiles(restoration.id),
      getBalanceDue(restoration.id),
      supabase
        .from("workshops")
        .select("id, name")
        .eq("active", true)
        .order("name"),
      canSeeCost
        ? supabase.rpc("get_piece_service_cost", { p_piece_id: id })
        : Promise.resolve({ data: null, error: null }),
    ]);
  if (workshops.error) throw workshops.error;
  if (cost.error) throw cost.error;
  const costCents = cost.data === null ? null : toCents(Number(cost.data));
  const pieceFiles = files.filter((f) => f.pieceId === piece.id);
  // Destino fijo: lo que se sube aquí es de esta pieza (no se elige "Para").
  const fileTargets = [
    { id: piece.id, label: `${piece.code} · ${piece.description}` },
  ];
  const canUpload = can(user.role, "fotos.subir");
  const info = logistics?.get(piece.id);
  const weight =
    piece.weightGrams === null
      ? null
      : `${piece.weightGrams.toLocaleString("es-PE")} g`;
  const showMoney = canSeeCost || canSeeMoney;

  return (
    <div className="space-y-4">
      <PageBreadcrumb label={piece.code} />
      <Button asChild variant="ghost" size="sm" className="-my-1 -ml-2">
        <Link href="/piezas">
          <ArrowLeft />
          Piezas
        </Link>
      </Button>

      {/*
        Encima del pliegue. En escritorio: fotos a la izquierda (abarcan las dos filas)
        y, a la derecha, la cabecera arriba y los datos debajo. En el celular el orden
        del DOM manda: cabecera (con acciones y montos), fotos y datos.
      */}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:grid-rows-[auto_1fr] lg:gap-5">
        <section
          className={cn(CARD_CLASS, PIECE_ACCENT_CLASS, "lg:col-start-2")}
          aria-labelledby="titulo-pieza"
        >
          <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
            <div className="min-w-0 space-y-1.5">
              <PieceEyebrow number={piece.number} code={piece.code} />
              <h1
                id="titulo-pieza"
                className="text-heading text-2xl font-semibold tracking-tight text-balance"
              >
                {piece.description}
              </h1>
              <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
                <Link
                  href={`/clientes/${restoration.client.id}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {restoration.client.name}
                </Link>
                <span className="text-muted-foreground" aria-hidden>
                  ·
                </span>
                <span className="text-muted-foreground">
                  Guía {restoration.code}
                </span>
                <RestorationStatusBadge
                  status={restoration.status}
                  className="ml-0.5"
                />
              </p>
            </div>
            {/* Navegación, no acción: botón secundario para no competir con la principal. */}
            <Button asChild variant="outline" size="sm" className="shrink-0">
              <Link href={`/restauraciones/${restoration.id}`}>
                <ClipboardList />
                Ver guía {restoration.code}
              </Link>
            </Button>
          </header>

          <PieceStatusPanel
            className="mt-4 border-t pt-4"
            restorationId={restoration.id}
            piece={piece}
            role={user.role}
            workshops={workshops.data}
            balanceDue={balanceDue}
          />

          {showMoney ? (
            <section
              className="mt-4 space-y-2 border-t pt-4"
              aria-labelledby="montos-pieza"
            >
              <h2
                id="montos-pieza"
                className="text-muted-foreground text-xs font-medium"
              >
                Montos
              </h2>
              <PieceMoneyTiles
                piece={{
                  id: piece.id,
                  code: piece.code,
                  restorationId: restoration.id,
                }}
                sale={
                  canSeeMoney
                    ? {
                        cents: piece.priceCents,
                        hasOrder: restoration.hasOrder,
                        editable: can(user.role, "piezas.precio-venta"),
                        pricesIncludeIgv:
                          restoration.money?.pricesIncludeIgv ?? null,
                      }
                    : null
                }
                costCents={canSeeCost ? costCents : undefined}
                guide={
                  restoration.money
                    ? {
                        totalCents: restoration.money.totalCents,
                        paidCents: restoration.money.paidCents,
                      }
                    : null
                }
              />
            </section>
          ) : null}
        </section>

        <section
          className={cn(
            CARD_CLASS,
            "space-y-3 lg:col-start-1 lg:row-span-2 lg:row-start-1",
          )}
          aria-labelledby="fotos-pieza"
        >
          <h2
            id="fotos-pieza"
            className="text-heading flex items-center gap-1.5 font-semibold"
          >
            <Images aria-hidden className="size-4" />
            Fotos y archivos
            {pieceFiles.length > 0 ? (
              <span className="text-muted-foreground font-normal">
                ({pieceFiles.length})
              </span>
            ) : null}
          </h2>
          <FileGallery
            files={pieceFiles}
            targets={fileTargets}
            currentUserId={user.id}
            isAdmin={user.role === "admin"}
            emptyText="La pieza aún no tiene fotos."
            className="min-w-0"
            showTargetLabels={false}
          />
        </section>

        <section
          className={cn(CARD_CLASS, "space-y-3 lg:col-start-2")}
          aria-labelledby="datos-pieza"
        >
          <h2 id="datos-pieza" className="text-heading font-semibold">
            Datos de la pieza
          </h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
            <Field label="Servicio">{piece.serviceName || null}</Field>
            <Field label="Material">{piece.materialName || null}</Field>
            <Field label="Peso">{weight}</Field>
            <Field label="Medida">{piece.measure || null}</Field>
            <Field label="Taller">
              {/* Aquí se cambia un taller ya asignado (en /piezas solo se asigna). */}
              <PieceWorkshopField
                piece={{
                  id: piece.id,
                  code: piece.code,
                  status: piece.status,
                  workshopId: piece.workshopId,
                  workshopName: piece.workshopName,
                }}
                workshops={workshops.data}
                canAssign={can(user.role, "piezas.asignar-taller")}
              />
            </Field>
            <Field label="Registrada">{formatDate(piece.createdAt)}</Field>
            <Field label="Llegó a la tienda">
              {piece.arrivedAt ? formatDate(piece.arrivedAt) : null}
            </Field>
            {piece.deliveredAt ? (
              <Field label="Entregada">{formatDate(piece.deliveredAt)}</Field>
            ) : null}
            <Field label="Notas de la pieza" wide>
              {piece.notes || null}
            </Field>
          </dl>
        </section>
      </div>

      {/* Debajo del pliegue: historia y subida de archivos. */}
      <div
        className={cn(
          "grid items-start gap-4 lg:gap-5",
          canUpload && "lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]",
        )}
      >
        <div className={cn("min-w-0", canUpload && "lg:col-start-2")}>
          {canSeeMoney ? (
            <PieceTimelineStrip
              piece={piece}
              events={history.filter((e) => e.pieceId === piece.id)}
              now={new Date()}
            />
          ) : (
            <section
              className="bg-card space-y-2 rounded-lg border p-3 sm:p-4"
              aria-labelledby="historia-pieza"
            >
              <h2 id="historia-pieza" className="text-heading font-semibold">
                Historia
              </h2>
              {info ? (
                <LogisticsPieceSummary info={info} />
              ) : (
                <p className="text-muted-foreground text-sm">
                  Sin movimientos.
                </p>
              )}
            </section>
          )}
        </div>
        {canUpload ? (
          <FileUploader
            restorationId={restoration.id}
            targets={fileTargets}
            className="bg-card min-w-0 lg:col-start-1 lg:row-start-1"
          />
        ) : null}
      </div>
    </div>
  );
}

function Field({
  label,
  wide = false,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("min-w-0 space-y-0.5", wide && "col-span-full")}>
      <dt className="text-muted-foreground text-xs font-medium">{label}</dt>
      <dd className="break-words whitespace-pre-wrap">
        {children ?? <span className="text-muted-foreground">—</span>}
      </dd>
    </div>
  );
}
