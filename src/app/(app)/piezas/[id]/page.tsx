import { ArrowLeft, ClipboardList } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { FileGallery } from "@/components/files/file-gallery";
import { FileUploader } from "@/components/files/file-uploader";
import {
  PIECE_ACCENT_CLASS,
  PieceEyebrow,
} from "@/components/restorations/guide-labels";
import {
  LogisticsPieceSummary,
  PieceTimelineDetails,
} from "@/components/restorations/piece-history";
import {
  SalePriceInput,
  ServiceCostInput,
} from "@/components/restorations/piece-money-cells";
import { PieceStatusPanel } from "@/components/restorations/piece-status-actions";
import { RestorationStatusBadge } from "@/components/restorations/status-badges";
import { Button } from "@/components/ui/button";
import { IGV_PERCENT, priceWithIgv } from "@/domain/igv";
import { formatCents, toCents } from "@/domain/money";
import { can } from "@/domain/permissions";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/server/auth";
import { listRestorationFiles } from "@/server/files/queries";
import { getBalanceDue } from "@/server/payments/queries";
import {
  getLogisticsInfo,
  getRestorationDetail,
  getStatusHistory,
} from "@/server/restorations/queries";

export const metadata: Metadata = { title: "Pieza" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Detalle completo de una pieza (P55): sus datos, estado y acciones, montos según el
 * rol, línea de tiempo y fotos, con un acceso explícito a su guía (la restauración).
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
  const fileTargets = [
    { id: piece.id, label: `${piece.code} · ${piece.description}` },
  ];
  const info = logistics?.get(piece.id);
  const weight =
    piece.weightGrams === null
      ? null
      : `${piece.weightGrams.toLocaleString("es-PE")} g`;
  const moneyPiece = {
    id: piece.id,
    code: piece.code,
    restorationId: restoration.id,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/piezas">
            <ArrowLeft />
            Piezas
          </Link>
        </Button>
      </div>

      <section
        className={cn(
          "bg-card space-y-4 rounded-lg border p-4 shadow-xs sm:p-5",
          PIECE_ACCENT_CLASS,
        )}
        aria-labelledby="titulo-pieza"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <PieceEyebrow number={piece.number} code={piece.code} />
            <h1
              id="titulo-pieza"
              className="text-heading text-2xl font-semibold tracking-tight"
            >
              {piece.code}
            </h1>
            <p className="text-muted-foreground text-sm">
              {restoration.client.name}
            </p>
          </div>
          {/* Acceso explícito a la guía (la restauración) de la pieza. */}
          <Button asChild>
            <Link href={`/restauraciones/${restoration.id}`}>
              <ClipboardList />
              Ver guía {restoration.code}
            </Link>
          </Button>
        </div>
        <p className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
          Estado de la guía:{" "}
          <RestorationStatusBadge status={restoration.status} />
        </p>

        <PieceStatusPanel
          restorationId={restoration.id}
          piece={piece}
          role={user.role}
          workshops={workshops.data}
          balanceDue={balanceDue}
        />
      </section>

      <section className="space-y-3" aria-labelledby="datos-pieza">
        <h2 id="datos-pieza" className="text-heading font-semibold">
          Datos de la pieza
        </h2>
        <dl className="grid gap-x-6 gap-y-3 rounded-lg border p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Descripción" wide>
            {piece.description}
          </Field>
          <Field label="Servicio">{piece.serviceName || null}</Field>
          <Field label="Material">{piece.materialName || null}</Field>
          <Field label="Peso">{weight}</Field>
          <Field label="Medida">{piece.measure || null}</Field>
          <Field label="Taller">{piece.workshopName ?? "Sin taller"}</Field>
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

      {canSeeCost || canSeeMoney ? (
        <section className="space-y-3" aria-labelledby="montos-pieza">
          <h2 id="montos-pieza" className="text-heading font-semibold">
            Montos
          </h2>
          <dl className="grid gap-4 rounded-lg border p-4 text-sm sm:grid-cols-2">
            {canSeeCost ? (
              <div className="space-y-1">
                <dt className="text-muted-foreground">Costo de servicio</dt>
                <dd className="flex">
                  <ServiceCostInput piece={moneyPiece} cents={costCents} />
                </dd>
              </div>
            ) : null}
            {canSeeMoney ? (
              <div className="space-y-1">
                <dt className="text-muted-foreground">Precio de venta</dt>
                <dd className="flex flex-col items-start gap-1">
                  <SalePriceInput
                    piece={moneyPiece}
                    cents={piece.priceCents}
                    hasOrder={restoration.hasOrder}
                    editable={can(user.role, "piezas.precio-venta")}
                  />
                  {restoration.money && piece.priceCents !== null ? (
                    <span className="text-muted-foreground text-xs">
                      {restoration.money.pricesIncludeIgv
                        ? "IGV incluido"
                        : `Con IGV (${IGV_PERCENT} %): ${formatCents(
                            priceWithIgv(piece.priceCents, false),
                          )}`}
                    </span>
                  ) : null}
                </dd>
              </div>
            ) : null}
          </dl>
        </section>
      ) : null}

      <section className="space-y-3" aria-labelledby="historia-pieza">
        <h2 id="historia-pieza" className="text-heading font-semibold">
          Historia
        </h2>
        {canSeeMoney ? (
          <PieceTimelineDetails
            piece={piece}
            events={history.filter((e) => e.pieceId === piece.id)}
            now={new Date()}
          />
        ) : info ? (
          <LogisticsPieceSummary info={info} />
        ) : (
          <p className="text-muted-foreground text-sm">Sin movimientos.</p>
        )}
      </section>

      <section className="space-y-3" aria-labelledby="fotos-pieza">
        <h2 id="fotos-pieza" className="text-heading font-semibold">
          Fotos y archivos
        </h2>
        {can(user.role, "fotos.subir") ? (
          <FileUploader restorationId={restoration.id} targets={fileTargets} />
        ) : null}
        {pieceFiles.length > 0 ? (
          <FileGallery
            files={pieceFiles}
            targets={fileTargets}
            currentUserId={user.id}
            isAdmin={user.role === "admin"}
          />
        ) : (
          <p className="text-muted-foreground text-sm">
            La pieza aún no tiene fotos.
          </p>
        )}
      </section>
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
    <div className={cn("space-y-0.5", wide && "sm:col-span-2 lg:col-span-3")}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-words whitespace-pre-wrap">
        {children ?? <span className="text-muted-foreground">—</span>}
      </dd>
    </div>
  );
}
