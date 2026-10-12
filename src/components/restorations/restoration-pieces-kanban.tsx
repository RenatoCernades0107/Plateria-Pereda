"use client";

import Link from "next/link";
import { useState } from "react";

import { KanbanCard, KanbanColumns } from "@/components/kanban-columns";
import { formatCents } from "@/domain/money";
import { can } from "@/domain/permissions";
import { PIECE_STATUS_LABELS } from "@/domain/piece-state-machine";
import {
  pieceHref,
  restorationKanbanStatuses,
} from "@/domain/restoration-pieces-view";
import type { AppRole } from "@/lib/roles";
import type { PieceDetail } from "@/server/restorations/queries";

import type { WorkshopOption } from "./piece-fields";
import { isSelectable, PiecesBulkBar } from "./pieces-bulk-bar";
import { LocationBadge, UrgentBadge } from "./status-badges";

/**
 * Piezas de una restauración en un tablero kanban por estado (detalle, `?vista=kanban`).
 * Las columnas de estados finales solo aparecen si tienen piezas. Se eligen piezas
 * y se usan las mismas acciones masivas que en la lista; el precio solo lo ve quien
 * ve montos.
 */
export function RestorationPiecesKanban({
  restorationId,
  pieces,
  role,
  workshops,
}: {
  restorationId: string;
  pieces: PieceDetail[];
  role: AppRole;
  workshops: WorkshopOption[];
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const chosen = pieces.filter((p) => selected.includes(p.id));
  const toggle = (id: string, on: boolean) =>
    setSelected((s) => (on ? [...s, id] : s.filter((x) => x !== id)));
  const showMoney = can(role, "dinero.ver");
  const statuses = restorationKanbanStatuses(pieces.map((p) => p.status));

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
        columns={statuses.map((status) => ({
          key: status,
          label: PIECE_STATUS_LABELS[status],
          items: pieces.filter((p) => p.status === status),
        }))}
        renderCard={(piece) => (
          <KanbanCard key={piece.id} data-testid={`tarjeta-${piece.code}`}>
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
                  href={pieceHref({ id: piece.id, restorationId })}
                  className="text-heading font-medium underline-offset-4 hover:underline"
                >
                  {piece.code}
                </Link>
              </div>
              {showMoney ? (
                <span
                  className="shrink-0 text-xs tabular-nums"
                  data-testid="precio"
                >
                  <span className="sr-only">Precio: </span>
                  {piece.priceCents === null ? (
                    <span className="text-muted-foreground">Sin asignar</span>
                  ) : (
                    formatCents(piece.priceCents)
                  )}
                </span>
              ) : null}
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
    </div>
  );
}
