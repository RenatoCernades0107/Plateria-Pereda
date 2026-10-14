"use client";

import Link from "next/link";

import { navigateRow } from "@/components/clickable-row";
import { formatCents } from "@/domain/money";
import { pieceHref } from "@/domain/restoration-pieces-view";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { HistoryPiece } from "@/server/restorations/piece-history-queries";

import { materialSummary, PiecePhoto } from "./piece-photo";
import { PieceStatusBadge, UrgentBadge } from "./status-badges";

const Money = ({ cents, empty }: { cents: number | null; empty: string }) =>
  cents === null ? (
    <span className="text-muted-foreground">{empty}</span>
  ) : (
    <span className="tabular-nums">{formatCents(cents)}</span>
  );

/**
 * Historial de piezas terminadas, en una tabla de solo lectura con las mismas
 * columnas base que la vista de piezas. Los montos siguen el rol: costo de servicio
 * (admin y logística) y precio de venta (admin y ventas).
 */
export function PiecesHistoryTable({
  pieces,
  showCost,
  showPrice,
}: {
  pieces: HistoryPiece[];
  showCost: boolean;
  showPrice: boolean;
}) {
  if (pieces.length === 0) {
    return (
      <p className="text-muted-foreground rounded-md border p-6 text-center text-sm">
        No hay piezas en el historial con esos filtros.
      </p>
    );
  }

  const head = "px-3 py-2 text-left font-medium whitespace-nowrap";
  const cell = "px-3 py-2 align-top";

  return (
    <div className="relative overflow-x-auto rounded-lg border">
      <table className="w-full min-w-max border-collapse text-sm">
        <caption className="sr-only">Historial de piezas</caption>
        <thead className="bg-muted/60 text-muted-foreground border-b text-xs">
          <tr>
            <th scope="col" className={head}>
              Foto antes
            </th>
            <th scope="col" className={head}>
              Pieza
            </th>
            <th scope="col" className={head}>
              Guía · cliente
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
              className="hover:bg-muted/30 cursor-pointer"
              data-testid={`historial-${piece.code}`}
              onClick={navigateRow}
            >
              <td className={cell}>
                <PiecePhoto code={piece.code} url={piece.photoUrl} />
              </td>
              <td className={cn(cell, "whitespace-nowrap")}>
                <Link
                  href={pieceHref(piece)}
                  data-primary-link
                  className="text-heading font-medium underline-offset-4 hover:underline"
                >
                  {piece.code}
                </Link>
                {piece.urgent ? (
                  <div className="mt-1">
                    <UrgentBadge />
                  </div>
                ) : null}
              </td>
              <td className={cn(cell, "max-w-44")}>
                <Link
                  href={`/restauraciones/${piece.restorationId}`}
                  className="whitespace-nowrap underline-offset-4 hover:underline"
                  aria-label={`Ver guía ${piece.restorationCode}`}
                >
                  {piece.restorationCode}
                </Link>
                <p className="text-muted-foreground text-xs">
                  {piece.clientName}
                </p>
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
                  <Money cents={piece.priceCents} empty="Sin asignar" />
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
