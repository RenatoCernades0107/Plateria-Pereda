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
import { can } from "@/domain/permissions";
import {
  availableTransitions,
  canMarkArrived,
  PIECE_STATUS_LABELS,
  type PieceStatus,
  type PieceTransition,
} from "@/domain/piece-state-machine";
import type { AppRole } from "@/lib/roles";
import {
  assignWorkshop,
  changePieceStatus,
  markPiecesArrived,
} from "@/server/restorations/status-actions";

import type { WorkshopOption } from "./piece-fields";
import {
  ACTION_LABELS,
  needsDialog,
  requirementsFor,
  StatusChangeDialog,
  type PendingChange,
  type StatusPiece,
} from "./piece-status-actions";

/** No se cambia el taller de una pieza en el taller, entregada o anulada. */
export const WORKSHOP_LOCKED: readonly PieceStatus[] = [
  "enviada_taller",
  "entregada",
  "anulada",
];

/**
 * Cambios que se pueden aplicar a TODAS las piezas elegidas (acciones masivas),
 * agrupados por estado de destino.
 */
export function commonTransitions(
  pieces: readonly Pick<StatusPiece, "status">[],
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

/** Si la pieza puede elegirse para alguna acción masiva. */
export function isSelectable(
  piece: Pick<StatusPiece, "status">,
  role: AppRole,
) {
  return (
    availableTransitions(piece, role).length > 0 ||
    (can(role, "piezas.asignar-taller") &&
      !WORKSHOP_LOCKED.includes(piece.status))
  );
}

const NONE = "ninguno";

/**
 * Acciones para las piezas elegidas: los cambios de estado comunes, la llegada en
 * bloque y "Asignar taller". `restorationId` null = piezas de varias restauraciones
 * (vista de piezas).
 */
export function PiecesBulkBar({
  restorationId,
  chosen,
  role,
  workshops,
  onDone,
}: {
  restorationId: string | null;
  chosen: StatusPiece[];
  role: AppRole;
  workshops: WorkshopOption[];
  onDone: () => void;
}) {
  const [dialog, setDialog] = useState<PendingChange | null>(null);
  const [bulkWorkshop, setBulkWorkshop] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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
  const bulkAssign =
    can(role, "piezas.asignar-taller") &&
    chosen.length > 0 &&
    chosen.every((p) => !WORKSHOP_LOCKED.includes(p.status));
  const ids = chosen.map((p) => p.id);

  const done = (message: string) => {
    toast.success(message);
    onDone();
  };

  const applyBulk = async (
    change: PendingChange,
    input: { note: string | null; workshopId: string | null },
  ) => {
    const result = await changePieceStatus(
      restorationId,
      ids,
      change.to,
      input.note,
      input.workshopId,
    );
    if ("error" in result) return result.error;
    done(
      `${chosen.length === 1 ? "1 pieza" : `${chosen.length} piezas`}: ${PIECE_STATUS_LABELS[change.to]}.`,
    );
    return null;
  };

  if (chosen.length === 0) return null;

  return (
    <div
      className="bg-muted/50 flex flex-wrap items-end gap-2 rounded-lg border p-3"
      role="region"
      aria-label="Acciones para las piezas elegidas"
    >
      <p className="mr-auto text-sm font-medium">
        {chosen.length === 1
          ? "1 pieza elegida"
          : `${chosen.length} piezas elegidas`}
      </p>
      {bulkArrival ? (
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await markPiecesArrived(restorationId, ids);
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
          className={change.to === "anulada" ? "text-destructive" : undefined}
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
                  ids,
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
      <Button size="sm" variant="ghost" onClick={onDone}>
        Quitar selección
      </Button>
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
