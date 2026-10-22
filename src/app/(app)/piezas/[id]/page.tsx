import { ArrowLeft, ClipboardList, Images } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageBreadcrumb } from "@/components/page-breadcrumb";
import { FilesPanel } from "@/components/files/files-panel";
import {
  PIECE_CARD_CLASS,
  PieceEyebrow,
} from "@/components/restorations/guide-labels";
import {
  LogisticsPieceSummary,
  PieceTimelineStrip,
} from "@/components/restorations/piece-history";
import { PieceMoneyTiles } from "@/components/restorations/piece-money-tiles";
import { PieceHeader } from "@/components/restorations/piece-status-actions";
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
  getPreviousStatus,
  getRestorationDetail,
  getStatusHistory,
} from "@/server/restorations/queries";

export async function generateMetadata({
  params,
}: PageProps<"/piezas/[id]">): Promise<Metadata> {
  return recordMetadata("piece", (await params).id, "Pieza");
}

const CARD_CLASS = "bg-card rounded-lg border p-4 shadow-xs sm:p-5";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Detalle completo de una pieza (P55). Arriba, como en la guía, la cabecera: título y
 * estado a la izquierda, acciones a la derecha. Debajo, en dos columnas desde `lg`,
 * montos y datos junto a las fotos (lo esencial sin desplazarse) y al final la línea
 * de tiempo a lo ancho. En el celular, todo en una columna en ese orden.
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
    withClient: can(user.role, "clientes.ver"),
  });
  const piece = restoration?.pieces.find((p) => p.id === id);
  if (!restoration || !piece) notFound();

  const canSeeCost = can(user.role, "piezas.costo-servicio");
  // Precio de venta de la pieza: también logística (sin totales, pagos ni margen).
  const canSeePrice = can(user.role, "piezas.precio-venta.ver");
  const [
    history,
    logistics,
    files,
    balanceDue,
    workshops,
    cost,
    previousStatus,
  ] = await Promise.all([
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
    getPreviousStatus(id),
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
  const showMoney = canSeeCost || canSeePrice || canSeeMoney;

  return (
    <div className="space-y-6">
      <PageBreadcrumb label={piece.code} />
      {/* En pantallas grandes la ruta de navegación del encabezado ya lleva a Piezas. */}
      <Button asChild variant="ghost" size="sm" className="-ml-2 md:hidden">
        <Link href="/piezas">
          <ArrowLeft />
          Piezas
        </Link>
      </Button>

      {/*
        Como la guía: la cabecera de la pieza (título y estado a la izquierda, acciones
        a la derecha) en su tarjeta blanca con el acento de pieza. Debajo, montos y
        datos (2/5) junto a las fotos (3/5); al final, el historial a lo ancho.
      */}
      <section
        aria-labelledby="titulo-pieza"
        className={PIECE_CARD_CLASS}
        data-testid="pieza"
      >
        <PieceHeader
          restorationId={restoration.id}
          piece={piece}
          role={user.role}
          workshops={workshops.data}
          balanceDue={balanceDue}
          previousStatus={previousStatus}
          heading={
            <div className="space-y-2">
              <PieceEyebrow
                number={piece.number}
                code={piece.code}
                quantity={piece.quantity}
              />
              <h1
                id="titulo-pieza"
                className="text-heading text-2xl font-semibold tracking-tight text-balance"
              >
                {piece.description}
              </h1>
              <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
                {restoration.client ? (
                  <>
                    <Link
                      href={`/clientes/${restoration.client.id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {restoration.client.name}
                    </Link>
                    <span className="text-muted-foreground" aria-hidden>
                      ·
                    </span>
                  </>
                ) : null}
                <Link
                  href={`/restauraciones/${restoration.id}`}
                  aria-label={`Ver guía ${restoration.code}`}
                  className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 whitespace-nowrap underline-offset-4 hover:underline"
                >
                  <ClipboardList aria-hidden className="size-3.5" />
                  Guía {restoration.code}
                </Link>
                <RestorationStatusBadge status={restoration.status} />
              </p>
            </div>
          }
        />
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="min-w-0 space-y-6">
          {showMoney ? (
            <section
              className={cn(CARD_CLASS, "space-y-3")}
              aria-labelledby="montos-pieza"
            >
              <h2 id="montos-pieza" className="text-heading font-semibold">
                Montos
              </h2>
              <PieceMoneyTiles
                className="sm:grid-cols-2"
                piece={{
                  id: piece.id,
                  code: piece.code,
                  restorationId: restoration.id,
                }}
                sale={
                  canSeePrice
                    ? {
                        cents: piece.priceCents,
                        hasOrder: restoration.hasOrder,
                        editable: can(user.role, "piezas.precio-venta"),
                      }
                    : null
                }
                costCents={canSeeCost ? costCents : undefined}
                quantity={piece.quantity}
                showMargin={can(user.role, "dinero.ver")}
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

          <section
            className={cn(CARD_CLASS, "space-y-3")}
            aria-labelledby="datos-pieza"
          >
            <h2 id="datos-pieza" className="text-heading font-semibold">
              Datos de la pieza
            </h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
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
                    location: piece.location,
                    workshopId: piece.workshopId,
                    workshopName: piece.workshopName,
                  }}
                  workshops={workshops.data}
                  canAssign={can(user.role, "piezas.asignar-taller")}
                />
              </Field>
              <Field label="Registrada">{formatDate(piece.createdAt)}</Field>
              {/* Lo que aún no pasó (llegada, entrega) o está vacío (notas) no se muestra. */}
              {piece.arrivedAt ? (
                <Field label="Llegó a la tienda">
                  {formatDate(piece.arrivedAt)}
                </Field>
              ) : null}
              {piece.deliveredAt ? (
                <Field label="Entregada">{formatDate(piece.deliveredAt)}</Field>
              ) : null}
              {piece.notes ? (
                <Field label="Notas de la pieza" wide>
                  {piece.notes}
                </Field>
              ) : null}
            </dl>
            {/* Logística no ve la línea de tiempo: su resumen va con los datos. */}
            {!canSeeMoney && info ? (
              <div className="border-t pt-3">
                <LogisticsPieceSummary info={info} />
              </div>
            ) : null}
          </section>
        </div>

        <section className="min-w-0 space-y-3" aria-labelledby="fotos-pieza">
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
          <FilesPanel
            stacked
            owner={{ kind: "restoration", id: restoration.id }}
            files={pieceFiles}
            targets={fileTargets}
            canUpload={canUpload}
            currentUserId={user.id}
            isAdmin={user.role === "admin"}
            emptyText="La pieza aún no tiene fotos."
            showTargetLabels={false}
          />
        </section>
      </div>

      {canSeeMoney ? (
        <PieceTimelineStrip
          piece={piece}
          events={history.filter((e) => e.pieceId === piece.id)}
          now={new Date()}
        />
      ) : null}
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
