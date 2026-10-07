"use client";

import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { isLongInWorkshop } from "@/domain/piece-board-filters";
import type { AppRole } from "@/lib/roles";
import { cn } from "@/lib/utils";
import type { BoardPiece } from "@/server/restorations/queries";

import type { WorkshopOption } from "./piece-fields";
import { isSelectable, PiecesBulkBar } from "./pieces-bulk-bar";
import { LocationBadge, PieceStatusBadge, UrgentBadge } from "./status-badges";

function Days({ piece }: { piece: BoardPiece }) {
  const long = isLongInWorkshop(piece);
  const label = `${piece.workshopDays} ${piece.workshopDays === 1 ? "día" : "días"}`;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-sm",
        long && "text-destructive font-medium",
      )}
      data-testid="dias-en-taller"
    >
      {long ? (
        <AlertTriangle
          className="size-4"
          aria-label="Muchos días en el taller"
        />
      ) : null}
      {piece.workshopOngoing ? `${label} (en curso)` : label}
    </span>
  );
}

/**
 * Vista operativa de piezas (12.2): piezas en curso de varias restauraciones, sin
 * precios, con selección para acciones masivas (enviar al taller, recibir del
 * taller, marcar llegada, devolver al cliente, asignar taller). Las urgentes van
 * primero; resalta las que llevan muchos días en el taller.
 */
export function PiecesBoardTable({
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
  const selectable = pieces.filter((p) => isSelectable(p, role));
  const allChosen =
    selectable.length > 0 && selectable.every((p) => selected.includes(p.id));
  const toggle = (id: string, on: boolean) =>
    setSelected((s) => (on ? [...s, id] : s.filter((x) => x !== id)));

  if (pieces.length === 0) {
    return (
      <p className="text-muted-foreground rounded-md border p-6 text-center text-sm">
        No hay piezas con esos filtros.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <PiecesBulkBar
        restorationId={null}
        chosen={chosen}
        role={role}
        workshops={workshops}
        onDone={() => setSelected([])}
      />
      {selectable.length > 0 ? (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="accent-primary size-4"
            checked={allChosen}
            onChange={(e) =>
              setSelected(e.target.checked ? selectable.map((p) => p.id) : [])
            }
          />
          Elegir todas las de esta página
        </label>
      ) : null}
      <ul className="divide-y rounded-lg border">
        {pieces.map((piece) => (
          <li
            key={piece.id}
            className={cn(
              "flex flex-wrap items-start gap-3 p-3 sm:flex-nowrap",
              isLongInWorkshop(piece) && "bg-destructive/5",
            )}
            data-testid={`pieza-${piece.code}`}
          >
            {isSelectable(piece, role) ? (
              <input
                type="checkbox"
                className="accent-primary mt-1 size-4 shrink-0"
                aria-label={`Elegir ${piece.code}`}
                checked={selected.includes(piece.id)}
                onChange={(e) => toggle(piece.id, e.target.checked)}
              />
            ) : (
              <span className="size-4 shrink-0" />
            )}
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm">
                <Link
                  href={`/restauraciones/${piece.restorationId}`}
                  className="text-heading font-medium underline-offset-4 hover:underline"
                >
                  {piece.code}
                </Link>
                <span className="text-muted-foreground">
                  {" "}
                  · {piece.clientName}
                </span>
              </p>
              <p className="break-words">{piece.description}</p>
              {piece.lastObservation ? (
                <p className="text-sm break-words">
                  <span className="text-muted-foreground">
                    Última observación:{" "}
                  </span>
                  {piece.lastObservation}
                </p>
              ) : null}
            </div>
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-col sm:items-end">
              <div className="flex flex-wrap gap-2">
                {piece.urgent ? <UrgentBadge /> : null}
                <PieceStatusBadge status={piece.status} />
                <LocationBadge location={piece.location} />
              </div>
              <span className="text-muted-foreground text-sm">
                {piece.workshopName ?? "Sin taller"}
              </span>
              <Days piece={piece} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
