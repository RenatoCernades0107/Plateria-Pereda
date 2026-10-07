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
  canReceiveFromWorkshop,
  canReturnToClient,
  isClosedStatus,
  PIECE_STATUS_LABELS,
  type PieceStatus,
  type PieceTransition,
} from "@/domain/piece-state-machine";
import type { AppRole } from "@/lib/roles";
import {
  assignWorkshop,
  changePieceStatus,
  markPiecesArrived,
  receiveFromWorkshop,
  returnPiecesToClient,
} from "@/server/restorations/status-actions";

import type { WorkshopOption } from "./piece-fields";
import {
  ACTION_LABELS,
  needsDialog,
  requirementsFor,
  snapshotOf,
  StatusChangeDialog,
  type PendingChange,
  type StatusPiece,
} from "./piece-status-actions";

/** No se cambia el taller de una pieza en el taller, entregada o en un estado final. */
export const WORKSHOP_LOCKED: readonly PieceStatus[] = [
  "enviada_taller",
  "entregada",
  "rechazada",
  "sin_arreglo",
  "anulada",
];

/** Lo que las acciones masivas necesitan de cada pieza. */
type BulkPiece = Pick<
  StatusPiece,
  "status" | "arrivedAt" | "readyForDelivery" | "returnedAt"
>;

const snapshot = (piece: BulkPiece) =>
  snapshotOf({
    id: "",
    code: "",
    location: "sin_enviar",
    workshopId: null,
    urgent: false,
    ...piece,
  });

/**
 * Cambios que se pueden aplicar a TODAS las piezas elegidas (acciones masivas),
 * agrupados por estado de destino.
 */
export function commonTransitions(
  pieces: readonly BulkPiece[],
  role: AppRole,
): PendingChange[] {
  if (pieces.length === 0) return [];
  const byTarget = new Map<PieceStatus, PieceTransition[]>();
  pieces.forEach((piece, index) => {
    const targets = availableTransitions(snapshot(piece), role);
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
export function isSelectable(piece: BulkPiece, role: AppRole) {
  const s = snapshot(piece);
  return (
    availableTransitions(s, role).length > 0 ||
    canMarkArrived(s, role) ||
    canReceiveFromWorkshop(s, role) ||
    canReturnToClient(s, role) ||
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
  statusPicker = false,
  total = chosen.length,
}: {
  restorationId: string | null;
  chosen: StatusPiece[];
  role: AppRole;
  workshops: WorkshopOption[];
  onDone: () => void;
  /**
   * Cambio de estado con un selector ("Cambiar estado a…" + Aplicar) en lugar de un
   * botón por estado, y barra siempre visible (detalle de la restauración).
   */
  statusPicker?: boolean;
  /** Piezas que se pueden elegir, para el contador "N de M". */
  total?: number;
}) {
  const [target, setTarget] = useState<PieceStatus | null>(null);
  const [dialog, setDialog] = useState<PendingChange | null>(null);
  const [bulkWorkshop, setBulkWorkshop] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const bulk = commonTransitions(chosen, role);
  const every = (check: (piece: ReturnType<typeof snapshot>) => boolean) =>
    chosen.length > 0 && chosen.every((p) => check(snapshot(p)));
  const bulkArrival = every((p) => canMarkArrived(p, role));
  const bulkReceive = every((p) => canReceiveFromWorkshop(p, role));
  const bulkReturn = every((p) => canReturnToClient(p, role));
  const bulkAssign =
    can(role, "piezas.asignar-taller") &&
    chosen.length > 0 &&
    chosen.every((p) => !WORKSHOP_LOCKED.includes(p.status));
  const ids = chosen.map((p) => p.id);

  const done = (message: string) => {
    toast.success(message);
    setTarget(null);
    onDone();
  };
  const count = chosen.length === 1 ? "1 pieza" : `${chosen.length} piezas`;
  const act = (
    call: () => Promise<{ ok: true } | { error: string }>,
    message: string,
  ) =>
    startTransition(async () => {
      const result = await call();
      if ("error" in result) toast.error(result.error);
      else done(`${count}: ${message}`);
    });

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
    done(`${count}: ${PIECE_STATUS_LABELS[change.to]}.`);
    return null;
  };

  const runChange = (change: PendingChange) =>
    needsDialog(change)
      ? setDialog(change)
      : startTransition(async () => {
          const message = await applyBulk(change, {
            note: null,
            workshopId: null,
          });
          if (message) toast.error(message);
        });
  const picked = bulk.find((c) => c.to === target) ?? null;

  if (chosen.length === 0 && !statusPicker) return null;

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
        {statusPicker && total > 0 ? (
          <span className="text-muted-foreground font-normal">
            {" "}
            (de {total})
          </span>
        ) : null}
      </p>
      {bulkArrival ? (
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            act(
              () => markPiecesArrived(restorationId, ids),
              "llegada a la tienda.",
            )
          }
        >
          Marcar llegada a tienda
        </Button>
      ) : null}
      {bulkReceive ? (
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            act(
              () => receiveFromWorkshop(restorationId, ids),
              "de vuelta del taller.",
            )
          }
        >
          Recibir del taller
        </Button>
      ) : null}
      {bulkReturn ? (
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            act(
              () => returnPiecesToClient(restorationId, ids),
              "devuelta al cliente.",
            )
          }
        >
          Devolver al cliente
        </Button>
      ) : null}
      {statusPicker ? (
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="cambio-masivo" className="text-xs">
              Cambiar estado a…
            </Label>
            <Select
              value={picked?.to ?? ""}
              onValueChange={(v) => setTarget(v as PieceStatus)}
              disabled={pending || bulk.length === 0}
            >
              <SelectTrigger id="cambio-masivo" size="sm" className="w-48">
                <SelectValue
                  placeholder={
                    chosen.length === 0
                      ? "Elige piezas"
                      : bulk.length === 0
                        ? "Sin cambio común"
                        : "Elige un estado"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {bulk.map((change) => (
                  <SelectItem key={change.to} value={change.to}>
                    {ACTION_LABELS[change.to]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            size="sm"
            disabled={pending || picked === null}
            onClick={() => picked && runChange(picked)}
          >
            Aplicar a {count}
          </Button>
        </div>
      ) : (
        bulk.map((change) => (
          <Button
            key={change.to}
            size="sm"
            variant={isClosedStatus(change.to) ? "ghost" : "outline"}
            className={
              isClosedStatus(change.to) ? "text-destructive" : undefined
            }
            disabled={pending}
            onClick={() => runChange(change)}
          >
            {ACTION_LABELS[change.to]}
          </Button>
        ))
      )}
      {statusPicker && chosen.length > 1 && bulk.length === 0 ? (
        <p className="text-muted-foreground w-full text-xs">
          Las piezas elegidas no comparten un cambio de estado posible; desmarca
          las que no correspondan.
        </p>
      ) : null}
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
      {statusPicker ? null : (
        <Button size="sm" variant="ghost" onClick={onDone}>
          Quitar selección
        </Button>
      )}
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
