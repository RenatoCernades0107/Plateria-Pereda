"use client";

import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { BOARD_STATUSES, isLongInWorkshop } from "@/domain/piece-board-filters";
import { PIECE_STATUS_LABELS } from "@/domain/piece-state-machine";
import type { AppRole } from "@/lib/roles";
import { cn } from "@/lib/utils";
import type { BoardPiece } from "@/server/restorations/queries";

import type { WorkshopOption } from "./piece-fields";
import { isSelectable, PiecesBulkBar } from "./pieces-bulk-bar";
import { LocationBadge, UrgentBadge } from "./status-badges";

/**
 * Tablero kanban de piezas en curso: una columna por estado (las urgentes primero en
 * cada columna). Se eligen piezas de una o varias columnas y se usan las mismas
 * acciones masivas que en la tabla.
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

  return (
    <div className="space-y-3">
      <PiecesBulkBar
        restorationId={null}
        chosen={chosen}
        role={role}
        workshops={workshops}
        onDone={() => setSelected([])}
      />
      <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        <div className="flex gap-3" role="list" aria-label="Piezas por estado">
          {BOARD_STATUSES.map((status) => {
            const column = pieces.filter((p) => p.status === status);
            return (
              <section
                key={status}
                role="listitem"
                aria-label={PIECE_STATUS_LABELS[status]}
                className="bg-muted/40 flex w-72 shrink-0 flex-col gap-2 rounded-lg border p-2"
                data-testid={`columna-${status}`}
              >
                <h2 className="flex items-center justify-between px-1 text-sm font-semibold">
                  {PIECE_STATUS_LABELS[status]}
                  <span className="text-muted-foreground font-normal">
                    {column.length}
                  </span>
                </h2>
                {column.length === 0 ? (
                  <p className="text-muted-foreground px-1 py-4 text-center text-xs">
                    Sin piezas
                  </p>
                ) : (
                  column.map((piece) => {
                    const long = isLongInWorkshop(piece);
                    return (
                      <article
                        key={piece.id}
                        className={cn(
                          "bg-background space-y-1.5 rounded-md border p-3 text-sm shadow-xs",
                          long && "border-destructive/50",
                        )}
                        data-testid={`tarjeta-${piece.code}`}
                      >
                        <div className="flex items-start gap-2">
                          {isSelectable(piece, role) ? (
                            <input
                              type="checkbox"
                              className="accent-primary mt-0.5 size-4 shrink-0"
                              aria-label={`Elegir ${piece.code}`}
                              checked={selected.includes(piece.id)}
                              onChange={(e) =>
                                toggle(piece.id, e.target.checked)
                              }
                            />
                          ) : null}
                          <div className="min-w-0">
                            <Link
                              href={`/restauraciones/${piece.restorationId}`}
                              className="text-heading font-medium underline-offset-4 hover:underline"
                            >
                              {piece.code}
                            </Link>
                            <p className="text-muted-foreground truncate text-xs">
                              {piece.clientName}
                            </p>
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
                        {piece.workshopDays > 0 || piece.workshopOngoing ? (
                          <p
                            className={cn(
                              "inline-flex items-center gap-1 text-xs",
                              long && "text-destructive font-medium",
                            )}
                          >
                            {long ? (
                              <AlertTriangle
                                className="size-3.5"
                                aria-label="Muchos días en el taller"
                              />
                            ) : null}
                            {piece.workshopDays}{" "}
                            {piece.workshopDays === 1 ? "día" : "días"} en
                            taller
                            {piece.workshopOngoing ? " (en curso)" : ""}
                          </p>
                        ) : null}
                        {piece.lastObservation ? (
                          <p className="text-xs break-words">
                            <span className="text-muted-foreground">
                              Observación:{" "}
                            </span>
                            {piece.lastObservation}
                          </p>
                        ) : null}
                      </article>
                    );
                  })
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
