import { ArrowLeft, ClipboardList } from "lucide-react";
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
import { PieceStatusPanel } from "@/components/restorations/piece-status-actions";
import { RestorationStatusBadge } from "@/components/restorations/status-badges";
import { PieceWorkshopField } from "@/components/restorations/workshop-edit-button";
import { Button } from "@/components/ui/button";
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UrlTabs } from "@/components/url-tabs";
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

/**
 * Detalle completo de una pieza (P55), con el mismo esquema que el de la guía: la
 * tarjeta de la pieza (estado, acciones, montos y datos) y, en pestañas, sus fotos y
 * su historial. Desde 1440 px, en dos columnas; si no, la tarjeta arriba.
 */
export default async function PiezaDetallePage({
  params,
  searchParams,
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
  // Pestaña abierta (`?pestana=historial`): sobrevive a recargas y se puede enlazar.
  const query = await searchParams;
  const tab = query.pestana === "historial" ? "historial" : "archivos";

  return (
    <div className="space-y-6">
      <PageBreadcrumb label={piece.code} />
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/piezas">
          <ArrowLeft />
          Piezas
        </Link>
      </Button>

      {/*
        El mismo esquema que el detalle de la guía: la pieza en su tarjeta (blanca, con
        el acento de pieza) y sus fotos e historial en pestañas. En pantallas anchas,
        dos columnas: la pieza a la izquierda (fija al bajar) y las pestañas a la
        derecha; si no, debajo.
      */}
      <div className="wide:grid-cols-[20rem_minmax(0,1fr)] grid items-start gap-6">
        <section
          aria-labelledby="titulo-pieza"
          className={cn(
            PIECE_CARD_CLASS,
            "wide:sticky wide:top-4 wide:max-h-[calc(100svh-2rem)] wide:overflow-y-auto space-y-4",
          )}
          data-testid="pieza"
        >
          <header className="wide:flex-col flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 space-y-2">
              <PieceEyebrow number={piece.number} code={piece.code} />
              <h1
                id="titulo-pieza"
                className="text-heading text-2xl font-semibold tracking-tight text-balance"
              >
                {piece.description}
              </h1>
              <p className="text-sm">
                <Link
                  href={`/clientes/${restoration.client.id}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {restoration.client.name}
                </Link>
                <span className="text-muted-foreground">
                  {" "}
                  ·{" "}
                  <span className="whitespace-nowrap">
                    Guía {restoration.code}
                  </span>
                </span>
              </p>
              <RestorationStatusBadge status={restoration.status} />
            </div>
            {/* Navegación, no acción: botón secundario para no competir con las acciones. */}
            <Button asChild variant="outline" size="sm" className="shrink-0">
              <Link href={`/restauraciones/${restoration.id}`}>
                <ClipboardList />
                Ver guía {restoration.code}
              </Link>
            </Button>
          </header>

          <PieceStatusPanel
            className="border-t pt-4"
            restorationId={restoration.id}
            piece={piece}
            role={user.role}
            workshops={workshops.data}
            balanceDue={balanceDue}
          />

          {showMoney ? (
            <section
              className="space-y-2 border-t pt-4"
              aria-labelledby="montos-pieza"
            >
              <h2
                id="montos-pieza"
                className="text-muted-foreground text-xs font-medium"
              >
                Montos
              </h2>
              <PieceMoneyTiles
                stackOnWide
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

          <section
            className="space-y-3 border-t pt-4"
            aria-labelledby="datos-pieza"
          >
            <h2
              id="datos-pieza"
              className="text-muted-foreground text-xs font-medium"
            >
              Datos de la pieza
            </h2>
            <dl className="wide:grid-cols-2 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
              <Field label="Servicio">{piece.serviceName || null}</Field>
              <Field label="Material">{piece.materialName || null}</Field>
              <Field label="Peso">{weight}</Field>
              <Field label="Medida">{piece.measure || null}</Field>
              {/* En la columna angosta, a lo ancho: el nombre y su lápiz no se parten. */}
              <Field label="Taller" className="wide:col-span-full">
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
        </section>

        <UrlTabs initial="archivos" defaultValue={tab} className="min-w-0">
          <TabsList>
            <TabsTrigger value="archivos">
              Fotos y archivos
              {pieceFiles.length > 0 ? ` (${pieceFiles.length})` : ""}
            </TabsTrigger>
            <TabsTrigger value="historial">Historial</TabsTrigger>
          </TabsList>
          <TabsContent value="archivos">
            <FilesPanel
              restorationId={restoration.id}
              files={pieceFiles}
              targets={fileTargets}
              canUpload={canUpload}
              currentUserId={user.id}
              isAdmin={user.role === "admin"}
              emptyText="La pieza aún no tiene fotos."
              showTargetLabels={false}
            />
          </TabsContent>
          <TabsContent value="historial">
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
          </TabsContent>
        </UrlTabs>
      </div>
    </div>
  );
}

function Field({
  label,
  wide = false,
  className,
  children,
}: {
  label: string;
  wide?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn("min-w-0 space-y-0.5", wide && "col-span-full", className)}
    >
      <dt className="text-muted-foreground text-xs font-medium">{label}</dt>
      <dd className="break-words whitespace-pre-wrap">
        {children ?? <span className="text-muted-foreground">—</span>}
      </dd>
    </div>
  );
}
