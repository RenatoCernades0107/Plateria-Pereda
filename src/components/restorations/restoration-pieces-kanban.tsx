"use client";

import Link from "next/link";
import { useState } from "react";

import { KanbanCard, KanbanColumns } from "@/components/kanban-columns";
import type { ApprovalPayment } from "@/components/payments/piece-payment-dialogs";
import { formatCents } from "@/domain/money";
import { can } from "@/domain/permissions";
import {
  isChargedKind,
  type RestorationKind,
} from "@/domain/restoration-status";
import {
  pieceHref,
  restorationKanbanStatuses,
} from "@/domain/restoration-pieces-view";
import type { AppRole } from "@/lib/roles";
import type { PieceDetail } from "@/server/restorations/queries";

import { PIECE_ACCENT_CLASS } from "./guide-labels";
import type { WorkshopOption } from "./piece-fields";
import {
  MoveToMenu,
  pieceBoardColumns,
  pieceColumnOf,
  usePieceMoves,
} from "./piece-moves";
import { isSelectable, PiecesBulkBar } from "./pieces-bulk-bar";
import { LocationBadge, UrgentBadge } from "./status-badges";

/**
 * Piezas de una restauración en un tablero kanban por estado (detalle, `?vista=kanban`).
 * Las columnas de estados finales solo aparecen si tienen piezas (o, al arrastrar,
 * si la pieza puede pasar a ellas). Las piezas se mueven de estado arrastrándolas o
 * con "Mover a…" (Paso 12.5). Se eligen piezas y se usan las mismas acciones masivas
 * que en la lista; el precio solo lo ve quien ve montos.
 */
export function RestorationPiecesKanban({
  restorationId,
  pieces,
  role,
  workshops,
  approvalPayment = null,
  balanceDue = false,
  guideKind = "normal",
}: {
  restorationId: string;
  pieces: PieceDetail[];
  role: AppRole;
  workshops: WorkshopOption[];
  /** Al aprobar la última pieza se ofrece registrar el adelanto (11.2). */
  approvalPayment?: ApprovalPayment | null;
  /** Falta cobrar el saldo: entregar pide confirmarlo (P45). */
  balanceDue?: boolean;
  /** Tipo de guía: interna u observada no muestran precios. */
  guideKind?: RestorationKind;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const chosen = pieces.filter((p) => selected.includes(p.id));
  const toggle = (id: string, on: boolean) =>
    setSelected((s) => (on ? [...s, id] : s.filter((x) => x !== id)));
  // Solo el precio de venta de cada pieza (también logística), sin totales.
  const showMoney =
    can(role, "piezas.precio-venta.ver") && isChargedKind(guideKind);
  const moves = usePieceMoves({
    restorationId,
    pieces,
    role,
    workshops,
    approvalPayment,
    balanceDue,
  });
  const shown = moves.pieces;
  const statuses = restorationKanbanStatuses(shown.map((p) => p.status));

  return (
    <div className="space-y-3">
      <PiecesBulkBar
        restorationId={restorationId}
        chosen={chosen}
        role={role}
        workshops={workshops}
        onDone={() => setSelected([])}
      />
      <KanbanColumns
        label="Piezas por estado"
        emptyText="Sin piezas"
        columns={pieceBoardColumns(statuses).map(
          ({ key, label, dropOnly }) => ({
            key,
            label,
            items: shown.filter((p) => pieceColumnOf(p) === key),
            dropOnly,
          }),
        )}
        drag={moves.drag}
        renderCard={(piece, drag) => (
          <KanbanCard
            key={piece.id}
            data-testid={`tarjeta-${piece.code}`}
            className={PIECE_ACCENT_CLASS}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-start gap-2">
                {isSelectable(piece, role) ? (
                  <input
                    type="checkbox"
                    className="accent-primary mt-0.5 size-4 shrink-0"
                    aria-label={`Elegir ${piece.code}`}
                    checked={selected.includes(piece.id)}
                    onChange={(e) => toggle(piece.id, e.target.checked)}
                  />
                ) : null}
                <Link
                  href={pieceHref(piece)}
                  className="text-heading font-medium underline-offset-4 hover:underline"
                >
                  {piece.code}
                </Link>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {showMoney ? (
                  <span className="text-xs tabular-nums" data-testid="precio">
                    <span className="sr-only">Precio: </span>
                    {piece.priceCents === null ? (
                      <span className="text-muted-foreground">Por definir</span>
                    ) : (
                      formatCents(piece.priceCents)
                    )}
                  </span>
                ) : null}
                <MoveToMenu
                  code={piece.code}
                  targets={moves.targets(piece)}
                  onMove={(to) => moves.move(piece, to)}
                  actions={moves.actions(piece)}
                />
                {drag?.handle}
              </div>
            </div>
            <p className="break-words">{piece.description}</p>
            {piece.serviceName ? (
              <p className="text-muted-foreground text-xs">
                Servicio: {piece.serviceName}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {piece.urgent ? <UrgentBadge /> : null}
              <LocationBadge location={piece.location} />
              <span className="text-muted-foreground">
                {piece.workshopName ?? "Sin taller"}
              </span>
            </div>
          </KanbanCard>
        )}
      />
      {moves.dialogs}
    </div>
  );
}
