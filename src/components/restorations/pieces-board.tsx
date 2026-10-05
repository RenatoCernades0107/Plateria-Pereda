"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCents } from "@/domain/money";
import { can } from "@/domain/permissions";
import {
  availableTransitions,
  canMarkArrived,
  PIECE_STATUS_LABELS,
  type PieceStatus,
  type PieceTransition,
} from "@/domain/piece-state-machine";
import type { PieceEditableField } from "@/domain/restoration-edit";
import type { AppRole } from "@/lib/roles";
import type { PieceDetail } from "@/server/restorations/queries";
import {
  assignWorkshop,
  changePieceStatus,
  markPiecesArrived,
} from "@/server/restorations/status-actions";

import { PieceDialog } from "./edit-dialogs";
import type { CatalogOption, WorkshopOption } from "./piece-fields";
import {
  ACTION_LABELS,
  needsDialog,
  PieceStatusPanel,
  requirementsFor,
  StatusChangeDialog,
  type PendingChange,
} from "./piece-status-actions";

/** No se cambia el taller de una pieza en el taller, entregada o anulada. */
const WORKSHOP_LOCKED: readonly PieceStatus[] = [
  "enviada_taller",
  "entregada",
  "anulada",
];

/**
 * Cambios que se pueden aplicar a TODAS las piezas elegidas (acciones masivas),
 * agrupados por estado de destino.
 */
export function commonTransitions(
  pieces: readonly Pick<PieceDetail, "status">[],
  role: AppRole,
): PendingChange[] {
  if (pieces.length === 0) return [];
  const byTarget = new Map<PieceStatus, PieceTransition[]>();
  pieces.forEach((piece, index) => {
    const targets = availableTransitions(piece, role);
    for (const t of targets) {
      if (index === 0) byTarget.set(t.to, [t]);
      else byTarget.get(t.to)?.push(t);
    }
    for (const to of [...byTarget.keys()]) {
      if (!targets.some((t) => t.to === to)) byTarget.delete(to);
    }
  });
  return [...byTarget.values()].map((ts) => requirementsFor(ts)!);
}

export type PieceEditing = {
  editable: Record<string, readonly PieceEditableField[]>;
  priceHint: string;
  materials: CatalogOption[];
  services: CatalogOption[];
};

const NONE = "ninguno";

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
  const [dialog, setDialog] = useState<PendingChange | null>(null);
  const [bulkWorkshop, setBulkWorkshop] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const chosen = pieces.filter((p) => selected.includes(p.id));
  const bulk = commonTransitions(chosen, role);
  const bulkArrival =
    chosen.length > 0 &&
    chosen.every((p) =>
      canMarkArrived(
        {
          status: p.status,
          arrivedAt: p.arrivedAt ? new Date(p.arrivedAt) : null,
        },
        role,
      ),
    );
  const canAssign = can(role, "piezas.asignar-taller");
  const bulkAssign =
    canAssign &&
    chosen.length > 0 &&
    chosen.every((p) => !WORKSHOP_LOCKED.includes(p.status));
  const selectable = pieces.filter(
    (p) =>
      availableTransitions(p, role).length > 0 ||
      (canAssign && !WORKSHOP_LOCKED.includes(p.status)),
  );

  const toggle = (id: string, on: boolean) =>
    setSelected((s) => (on ? [...s, id] : s.filter((x) => x !== id)));

  const done = (message: string) => {
    toast.success(message);
    setSelected([]);
  };

  const applyBulk = async (
    change: PendingChange,
    extraInput: { note: string | null; workshopId: string | null },
  ) => {
    const result = await changePieceStatus(
      restorationId,
      chosen.map((p) => p.id),
      change.to,
      extraInput.note,
      extraInput.workshopId,
    );
    if ("error" in result) return result.error;
    done(`${chosen.length} piezas: ${PIECE_STATUS_LABELS[change.to]}.`);
    return null;
  };

  return (
    <div className="space-y-3">
      {selected.length > 0 ? (
        <div
          className="bg-muted/50 flex flex-wrap items-end gap-2 rounded-lg border p-3"
          role="region"
          aria-label="Acciones para las piezas elegidas"
        >
          <p className="mr-auto text-sm font-medium">
            {selected.length === 1
              ? "1 pieza elegida"
              : `${selected.length} piezas elegidas`}
          </p>
          {bulkArrival ? (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await markPiecesArrived(
                    restorationId,
                    chosen.map((p) => p.id),
                  );
                  if ("error" in result) toast.error(result.error);
                  else done(`${chosen.length} piezas llegaron a la tienda.`);
                })
              }
            >
              Marcar llegada a tienda
            </Button>
          ) : null}
          {bulk.map((change) => (
            <Button
              key={change.to}
              size="sm"
              variant={change.to === "anulada" ? "ghost" : "outline"}
              className={
                change.to === "anulada" ? "text-destructive" : undefined
              }
              disabled={pending}
              onClick={() =>
                needsDialog(change)
                  ? setDialog(change)
                  : startTransition(async () => {
                      const message = await applyBulk(change, {
                        note: null,
                        workshopId: null,
                      });
                      if (message) toast.error(message);
                    })
              }
            >
              {ACTION_LABELS[change.to]}
            </Button>
          ))}
          {bulkAssign ? (
            <div className="flex items-end gap-2">
              <div className="space-y-1">
                <Label htmlFor="taller-masivo" className="text-xs">
                  Taller
                </Label>
                <Select
                  value={bulkWorkshop ?? NONE}
                  onValueChange={(v) => setBulkWorkshop(v === NONE ? null : v)}
                >
                  <SelectTrigger id="taller-masivo" size="sm" className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Sin asignar</SelectItem>
                    {workshops.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await assignWorkshop(
                      restorationId,
                      chosen.map((p) => p.id),
                      bulkWorkshop,
                    );
                    if ("error" in result) toast.error(result.error);
                    else done("Taller asignado.");
                  })
                }
              >
                Asignar taller
              </Button>
            </div>
          ) : null}
          <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
            Quitar selección
          </Button>
        </div>
      ) : null}

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
                  {selectable.some((p) => p.id === piece.id) ? (
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

      <StatusChangeDialog
        key={dialog?.to ?? "cerrado"}
        open={dialog !== null}
        onOpenChange={(open) => !open && setDialog(null)}
        change={dialog}
        pieces={chosen}
        workshops={workshops}
        onConfirm={(input) => applyBulk(dialog!, input)}
      />
    </div>
  );
}
