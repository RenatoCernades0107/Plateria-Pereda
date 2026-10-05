"use client";

import { useState } from "react";

import { formatCents } from "@/domain/money";
import type { PieceEditableField } from "@/domain/restoration-edit";
import type { AppRole } from "@/lib/roles";
import type { PieceDetail } from "@/server/restorations/queries";

import { PieceDialog } from "./edit-dialogs";
import type { CatalogOption, WorkshopOption } from "./piece-fields";
import { PieceStatusPanel } from "./piece-status-actions";
import { isSelectable, PiecesBulkBar } from "./pieces-bulk-bar";

export { commonTransitions } from "./pieces-bulk-bar";

export type PieceEditing = {
  editable: Record<string, readonly PieceEditableField[]>;
  priceHint: string;
  materials: CatalogOption[];
  services: CatalogOption[];
};

function Details({ piece }: { piece: PieceDetail }) {
  const details = [
    piece.serviceName && `Servicio: ${piece.serviceName}`,
    piece.materialName && `Material: ${piece.materialName}`,
    piece.measure && `Medida: ${piece.measure}`,
    piece.weightGrams !== null && `Peso: ${piece.weightGrams} g`,
    `Taller: ${piece.workshopName ?? "sin asignar"}`,
  ].filter(Boolean);
  return <p className="text-muted-foreground text-sm">{details.join(" · ")}</p>;
}

/**
 * Piezas de la restauración con su estado y acciones (Paso 8.4): cambio de estado
 * por pieza, selección para acciones masivas (p. ej. "Enviar al taller") y
 * asignación de taller. La edición de datos (7.7) solo aparece para quien edita.
 */
export function PiecesBoard({
  restorationId,
  pieces,
  role,
  workshops,
  editing,
  extra,
}: {
  restorationId: string;
  pieces: PieceDetail[];
  role: AppRole;
  workshops: WorkshopOption[];
  editing: PieceEditing | null;
  /** Contenido adicional por pieza (p. ej. línea de tiempo o datos de logística). */
  extra?: Record<string, React.ReactNode>;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const chosen = pieces.filter((p) => selected.includes(p.id));
  const toggle = (id: string, on: boolean) =>
    setSelected((s) => (on ? [...s, id] : s.filter((x) => x !== id)));

  return (
    <div className="space-y-3">
      <PiecesBulkBar
        restorationId={restorationId}
        chosen={chosen}
        role={role}
        workshops={workshops}
        onDone={() => setSelected([])}
      />

      <ul className="grid gap-3 md:grid-cols-2">
        {pieces.map((piece) => {
          const editable = editing?.editable[piece.id] ?? [];
          return (
            <li
              key={piece.id}
              className="space-y-2 rounded-lg border p-4"
              data-testid={`pieza-${piece.code}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex min-w-0 items-start gap-2">
                  {isSelectable(piece, role) ? (
                    <input
                      type="checkbox"
                      className="accent-primary mt-1 size-4"
                      aria-label={`Elegir ${piece.code}`}
                      checked={selected.includes(piece.id)}
                      onChange={(e) => toggle(piece.id, e.target.checked)}
                    />
                  ) : null}
                  <div className="min-w-0">
                    <p className="text-muted-foreground text-xs">
                      {piece.code}
                    </p>
                    <p className="text-heading font-medium break-words">
                      {piece.description}
                    </p>
                  </div>
                </div>
                {piece.priceCents !== null ? (
                  <p className="font-medium tabular-nums">
                    {formatCents(piece.priceCents)}
                  </p>
                ) : null}
              </div>
              <PieceStatusPanel
                restorationId={restorationId}
                piece={piece}
                role={role}
                workshops={workshops}
              />
              <Details piece={piece} />
              {piece.notes ? (
                <p className="text-sm whitespace-pre-line">{piece.notes}</p>
              ) : null}
              {extra?.[piece.id]}
              {editing && editable.length > 0 ? (
                <div className="flex justify-end">
                  <PieceDialog
                    restorationId={restorationId}
                    piece={piece}
                    editable={editable}
                    priceHint={editing.priceHint}
                    workshops={workshops}
                    materials={editing.materials}
                    services={editing.services}
                  />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
