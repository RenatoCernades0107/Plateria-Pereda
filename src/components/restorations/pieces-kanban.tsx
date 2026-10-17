"use client";

import { Hammer } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { KanbanCard, KanbanColumns } from "@/components/kanban-columns";
import { BOARD_STATUSES, isLongInWorkshop } from "@/domain/piece-board-filters";
import { can } from "@/domain/permissions";
import type { AppRole } from "@/lib/roles";
import { cn } from "@/lib/utils";
import type { BoardPiece } from "@/server/restorations/queries";

import type { WorkshopOption } from "./piece-fields";
import {
  MoveToMenu,
  pieceBoardColumns,
  pieceColumnOf,
  usePieceMoves,
} from "./piece-moves";
import { isSelectable, PiecesBulkBar } from "./pieces-bulk-bar";
import { LocationBadge, StatusAge, UrgentBadge } from "./status-badges";

/**
 * Tablero kanban de piezas en curso: una columna por estado (las urgentes primero en
 * cada columna). Las piezas se mueven de estado arrastrándolas o con "Mover a…"
 * (Paso 12.5); Entregada y Anulado aparecen como destino solo al arrastrar. Se
 * eligen piezas de una o varias columnas y se usan las mismas acciones masivas que
 * en la tabla.
 */
export function PiecesKanban({
  pieces,
  role,
  workshops,
}: {
  pieces: BoardPiece[];
  role: AppRole;
  workshops: WorkshopOption[];
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const chosen = pieces.filter((p) => selected.includes(p.id));
  const toggle = (id: string, on: boolean) =>
    setSelected((s) => (on ? [...s, id] : s.filter((x) => x !== id)));
  const moves = usePieceMoves({
    restorationId: null,
    pieces,
    role,
    workshops,
  });

  return (
    <div className="space-y-3">
      <PiecesBulkBar
        restorationId={null}
        chosen={chosen}
        role={role}
        workshops={workshops}
        onDone={() => setSelected([])}
      />
      <KanbanColumns
        label="Piezas por estado"
        emptyText="Sin piezas"
        columns={pieceBoardColumns(BOARD_STATUSES).map(
          ({ key, label, dropOnly }) => ({
            key,
            label,
            items: moves.pieces.filter((p) => pieceColumnOf(p) === key),
            dropOnly,
          }),
        )}
        drag={moves.drag}
        renderCard={(piece, drag) => {
          const long = isLongInWorkshop(piece);
          return (
            <KanbanCard
              key={piece.id}
              className={cn(long && "border-destructive/50")}
              data-testid={`tarjeta-${piece.code}`}
            >
              <div className="flex items-start gap-2">
                {isSelectable(piece, role) ? (
                  <input
                    type="checkbox"
                    className="accent-primary mt-0.5 size-4 shrink-0"
                    aria-label={`Elegir ${piece.code}`}
                    checked={selected.includes(piece.id)}
                    onChange={(e) => toggle(piece.id, e.target.checked)}
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/restauraciones/${piece.restorationId}`}
                    className="text-heading font-medium underline-offset-4 hover:underline"
                  >
                    {piece.code}
                  </Link>
                  {can(role, "clientes.ver") ? (
                    <p className="text-muted-foreground truncate text-xs">
                      {piece.clientName}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-1">
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
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {piece.urgent ? <UrgentBadge /> : null}
                <LocationBadge location={piece.location} />
                <span className="text-muted-foreground">
                  {piece.workshopName ?? "Sin taller"}
                </span>
              </div>
              {/* Fila de tiempos: cada dato es su propio elemento y se separan con
                  `gap`; en una tarjeta angosta el segundo baja a otra línea. */}
              <div
                className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"
                data-testid="tiempos-pieza"
              >
                <StatusAge piece={piece} />
                {piece.workshopDays > 0 || piece.workshopOngoing ? (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 whitespace-nowrap",
                      long
                        ? "text-destructive font-medium"
                        : "text-muted-foreground",
                    )}
                    data-testid="dias-en-taller"
                    title="Total de días en el taller, sumando todas las idas"
                  >
                    {/* Martillo (total en taller), no el triángulo del semáforo
                        del estado: son conteos distintos. */}
                    {long ? (
                      <Hammer
                        className="size-3.5"
                        role="img"
                        aria-label="Muchos días en el taller"
                      />
                    ) : (
                      <Hammer className="size-3.5" aria-hidden />
                    )}
                    {piece.workshopDays}{" "}
                    {piece.workshopDays === 1 ? "día" : "días"} en taller
                    {piece.workshopOngoing ? " (en curso)" : ""}
                  </span>
                ) : null}
              </div>
              {piece.lastObservation ? (
                <p className="text-xs break-words">
                  <span className="text-muted-foreground">Observación: </span>
                  {piece.lastObservation}
                </p>
              ) : null}
            </KanbanCard>
          );
        }}
      />
      {moves.dialogs}
    </div>
  );
}
