"use client";

import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { navigateRow } from "@/components/clickable-row";
import { formatCents } from "@/domain/money";
import { pieceHref } from "@/domain/restoration-pieces-view";
import { formatDateTime } from "@/lib/format";
import { DRAG_SCROLL_CLASS, useDragScroll } from "@/components/use-drag-scroll";
import { cn } from "@/lib/utils";
import type { HistoryPiece } from "@/server/restorations/piece-history-queries";

import { materialSummary, PiecePhoto } from "./piece-photo";
import { RT } from "./responsive-table";
import { PieceStatusBadge, UrgentIcon } from "./status-badges";

const Money = ({ cents, empty }: { cents: number | null; empty: string }) =>
  cents === null ? (
    <span className="text-muted-foreground">{empty}</span>
  ) : (
    <span className="tabular-nums">{formatCents(cents)}</span>
  );

// Foto y código quedan fijos al desplazarse de lado (foto de ancho fijo, con el
// `px-3` de las celdas, para saber dónde empieza el código).
const STICKY = {
  photo: cn(RT.sticky, "md:left-0 md:w-20 md:min-w-20"),
  code: cn(RT.sticky, RT.stickyEdge, "md:left-20"),
};

/**
 * Historial de piezas terminadas, en una tabla de solo lectura con las mismas
 * columnas base que la vista de piezas. Los montos siguen el rol: costo de servicio
 * (admin y logística) y precio de venta (admin y ventas).
 */
export function PiecesHistoryTable({
  pieces,
  showCost,
  showPrice,
  showClient = true,
  empty,
}: {
  pieces: HistoryPiece[];
  showCost: boolean;
  showPrice: boolean;
  /** Logística no ve clientes: solo el código de la guía. */
  showClient?: boolean;
  /** Reemplaza el vacío por defecto (p. ej. el de "sin resultados" por filtros). */
  empty?: React.ReactNode;
}) {
  const dragScroll = useDragScroll<HTMLDivElement>();
  if (pieces.length === 0) {
    return (
      empty ?? (
        <EmptyState>No hay piezas en el historial con esos filtros.</EmptyState>
      )
    );
  }

  const head = "px-3 py-2 text-left font-medium whitespace-nowrap";
  const cell = "px-3 py-2 align-top";

  return (
    <div
      ref={dragScroll}
      className={cn(
        "relative overflow-x-auto rounded-lg border",
        DRAG_SCROLL_CLASS,
      )}
    >
      <table className="w-full min-w-max border-collapse text-sm">
        <caption className="sr-only">Historial de piezas</caption>
        <thead
          className={cn(RT.headTint, "text-muted-foreground border-b text-xs")}
        >
          <tr>
            <th scope="col" className={cn(head, STICKY.photo)}>
              Foto antes
            </th>
            <th scope="col" className={cn(head, STICKY.code)}>
              Pieza
            </th>
            <th scope="col" className={head}>
              {showClient ? "Guía · cliente" : "Guía"}
            </th>
            <th scope="col" className={head}>
              Descripción
            </th>
            <th scope="col" className={head}>
              Servicio
            </th>
            {showCost ? (
              <th scope="col" className={cn(head, "text-right")}>
                Costo servicio
              </th>
            ) : null}
            {showPrice ? (
              <th scope="col" className={cn(head, "text-right")}>
                Precio venta
              </th>
            ) : null}
            <th scope="col" className={head}>
              Material · medida · peso
            </th>
            <th scope="col" className={head}>
              Estado
            </th>
            <th scope="col" className={head}>
              Taller
            </th>
            <th scope="col" className={head}>
              Entregada o cerrada
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {pieces.map((piece) => (
            <tr
              key={piece.id}
              className={cn("cursor-pointer bg-(--row-tint)", RT.hoverRow)}
              data-testid={`historial-${piece.code}`}
              onClick={navigateRow}
            >
              <td className={cn(cell, STICKY.photo)}>
                <PiecePhoto code={piece.code} url={piece.photoUrl} />
              </td>
              <td className={cn(cell, STICKY.code, "whitespace-nowrap")}>
                {/* Urgente: solo el rayo, al costado del código. */}
                <span className="inline-flex items-center gap-1">
                  <Link
                    href={pieceHref(piece)}
                    data-primary-link
                    className="text-heading font-medium underline-offset-4 hover:underline"
                  >
                    {piece.code}
                  </Link>
                  {piece.urgent ? <UrgentIcon /> : null}
                </span>
              </td>
              <td className={cn(cell, "max-w-44")}>
                <Link
                  href={`/restauraciones/${piece.restorationId}`}
                  className="whitespace-nowrap underline-offset-4 hover:underline"
                  aria-label={`Ver guía ${piece.restorationCode}`}
                >
                  {piece.restorationCode}
                </Link>
                {showClient ? (
                  <p className="text-muted-foreground text-xs">
                    {piece.clientName}
                  </p>
                ) : null}
              </td>
              <td className={cn(cell, "max-w-60 min-w-44")}>
                <p className="break-words">{piece.description}</p>
              </td>
              <td className={cn(cell, "max-w-36")}>
                {piece.serviceName || (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              {showCost ? (
                <td className={cn(cell, "text-right")}>
                  <Money cents={piece.serviceCostCents} empty="Sin definir" />
                </td>
              ) : null}
              {showPrice ? (
                <td className={cn(cell, "text-right")}>
                  <Money cents={piece.priceCents} empty="Por definir" />
                </td>
              ) : null}
              <td className={cn(cell, "text-muted-foreground max-w-40")}>
                {materialSummary(piece)}
              </td>
              <td className={cell}>
                <PieceStatusBadge status={piece.status} />
              </td>
              <td className={cn(cell, "whitespace-nowrap")}>
                {piece.workshopName ?? (
                  <span className="text-muted-foreground">Sin taller</span>
                )}
              </td>
              <td className={cn(cell, "whitespace-nowrap tabular-nums")}>
                {formatDateTime(piece.finishedAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
