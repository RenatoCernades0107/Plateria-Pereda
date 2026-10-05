"use client";

import { Loader2 } from "lucide-react";
import { useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";

import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  availableTransitions,
  canMarkArrived,
  PIECE_STATUS_LABELS,
  type PieceStatus,
  type PieceTransition,
} from "@/domain/piece-state-machine";
import { deriveLocation } from "@/domain/restoration-status";
import type { AppRole } from "@/lib/roles";
import {
  changePieceStatus,
  markPiecesArrived,
} from "@/server/restorations/status-actions";

import type { WorkshopOption } from "./piece-fields";
import { LocationBadge, PieceStatusBadge } from "./status-badges";

/** Texto del botón de cada cambio de estado (por estado de destino). */
export const ACTION_LABELS: Record<PieceStatus, string> = {
  registrada: "Registrar",
  en_consulta: "Poner en consulta",
  en_espera: "Esperar respuesta",
  aprobada: "Aprobar",
  recibida: "Recibir",
  enviada_taller: "Enviar al taller",
  devuelta_taller: "Recibir del taller",
  observada: "Observar",
  entregada: "Entregar",
  anulada: "Anular",
};

export type StatusPiece = {
  id: string;
  code: string;
  status: PieceStatus;
  arrivedAt: string | null;
  workshopId: string | null;
};

export type PendingChange = {
  to: PieceStatus;
  requiresNote: boolean;
  requiresWorkshop: boolean;
};

/** Requisitos de un cambio para varias piezas: basta que una lo exija. */
export function requirementsFor(
  transitions: readonly PieceTransition[],
): PendingChange | null {
  if (transitions.length === 0) return null;
  return {
    to: transitions[0]!.to,
    requiresNote: transitions.some((t) => t.requiresNote),
    requiresWorkshop: transitions.some((t) => t.requiresWorkshop),
  };
}

/** Necesita diálogo: nota, taller o una acción que no se deshace (anular). */
export const needsDialog = (change: PendingChange) =>
  change.requiresNote || change.requiresWorkshop || change.to === "anulada";

const NONE = "ninguno";

/** Confirmación de un cambio de estado con nota y/o taller cuando se requiere. */
export function StatusChangeDialog({
  open,
  onOpenChange,
  change,
  pieces,
  workshops,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  change: PendingChange | null;
  pieces: StatusPiece[];
  workshops: WorkshopOption[];
  onConfirm: (input: {
    note: string | null;
    workshopId: string | null;
  }) => Promise<string | null>;
}) {
  const [note, setNote] = useState("");
  const [workshopId, setWorkshopId] = useState<string | null>(
    pieces.length === 1 ? pieces[0]!.workshopId : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (!change) return null;

  const subject =
    pieces.length === 1 ? pieces[0]!.code : `${pieces.length} piezas`;
  const submit = () => {
    if (change.requiresNote && !note.trim()) {
      setError("Escribe una nota para este cambio de estado.");
      return;
    }
    if (change.requiresWorkshop && !workshopId) {
      setError("Elige el taller al que se envía la pieza.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const message = await onConfirm({
        note: note.trim() || null,
        workshopId: change.requiresWorkshop ? workshopId : null,
      });
      if (message) {
        setError(message);
        return;
      }
      setNote("");
      onOpenChange(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {ACTION_LABELS[change.to]}: {subject}
          </DialogTitle>
          <DialogDescription>
            Pasa a «{PIECE_STATUS_LABELS[change.to]}».
            {change.to === "anulada"
              ? " Una pieza anulada no se puede reactivar."
              : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {error ? <FormAlert>{error}</FormAlert> : null}
          {change.requiresWorkshop ? (
            <div className="space-y-1.5">
              <Label htmlFor="cambio-taller">Taller</Label>
              <Select
                value={workshopId ?? NONE}
                onValueChange={(v) => setWorkshopId(v === NONE ? null : v)}
              >
                <SelectTrigger id="cambio-taller" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Elige un taller</SelectItem>
                  {workshops.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="cambio-nota">
              {change.requiresNote ? "Nota (obligatoria)" : "Nota (opcional)"}
            </Label>
            <Textarea
              id="cambio-nota"
              rows={3}
              maxLength={1000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant={change.to === "anulada" ? "destructive" : "default"}
            onClick={submit}
            disabled={pending}
          >
            {pending ? "Guardando…" : `Confirmar: ${ACTION_LABELS[change.to]}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Estado, ubicación y acciones de una pieza (Paso 8.4). Solo muestra las
 * transiciones que el rol puede hacer; el cambio se ve al instante (optimista) y
 * vuelve atrás si la BD lo rechaza.
 */
export function PieceStatusPanel({
  restorationId,
  piece,
  role,
  workshops,
}: {
  restorationId: string;
  piece: StatusPiece;
  role: AppRole;
  workshops: WorkshopOption[];
}) {
  const [optimistic, setOptimistic] = useOptimistic(
    { status: piece.status, arrivedAt: piece.arrivedAt },
    (_state, next: { status: PieceStatus; arrivedAt: string | null }) => next,
  );
  const [pending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<PendingChange | null>(null);

  const transitions = availableTransitions(piece, role);
  const arrival = canMarkArrived(
    {
      status: piece.status,
      arrivedAt: piece.arrivedAt ? new Date(piece.arrivedAt) : null,
    },
    role,
  );

  const run = (
    change: PendingChange,
    extra = { note: null as string | null, workshopId: null as string | null },
  ) =>
    new Promise<string | null>((resolve) => {
      startTransition(async () => {
        setOptimistic({
          status:
            change.to === "aprobada" && piece.arrivedAt
              ? "recibida"
              : change.to,
          arrivedAt: piece.arrivedAt,
        });
        const result = await changePieceStatus(
          restorationId,
          [piece.id],
          change.to,
          extra.note,
          extra.workshopId,
        );
        if ("error" in result) {
          toast.error(result.error);
          resolve(result.error);
        } else {
          toast.success(`${piece.code}: ${PIECE_STATUS_LABELS[change.to]}.`);
          resolve(null);
        }
      });
    });

  const arrive = () =>
    startTransition(async () => {
      setOptimistic({
        status: piece.status === "aprobada" ? "recibida" : piece.status,
        arrivedAt: new Date().toISOString(),
      });
      const result = await markPiecesArrived(restorationId, [piece.id]);
      if ("error" in result) toast.error(result.error);
      else toast.success(`${piece.code}: llegó a la tienda.`);
    });

  const location = deriveLocation({
    status: optimistic.status,
    arrivedAt: optimistic.arrivedAt ? new Date(optimistic.arrivedAt) : null,
  });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <PieceStatusBadge status={optimistic.status} />
        <LocationBadge location={location} />
        {pending ? (
          <Loader2
            className="text-muted-foreground size-4 animate-spin"
            aria-label="Guardando"
          />
        ) : null}
      </div>
      {transitions.length > 0 || arrival ? (
        <div
          className="flex flex-wrap gap-2"
          aria-label={`Acciones de ${piece.code}`}
          role="group"
        >
          {arrival ? (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={arrive}
            >
              Marcar llegada a tienda
            </Button>
          ) : null}
          {transitions.map((t) => {
            const change = requirementsFor([t])!;
            return (
              <Button
                key={t.to}
                size="sm"
                variant={t.to === "anulada" ? "ghost" : "outline"}
                className={t.to === "anulada" ? "text-destructive" : undefined}
                disabled={pending}
                onClick={() =>
                  needsDialog(change) ? setDialog(change) : void run(change)
                }
              >
                {ACTION_LABELS[t.to]}
              </Button>
            );
          })}
        </div>
      ) : null}
      <StatusChangeDialog
        key={dialog?.to ?? "cerrado"}
        open={dialog !== null}
        onOpenChange={(open) => !open && setDialog(null)}
        change={dialog}
        pieces={[piece]}
        workshops={workshops}
        onConfirm={(extra) => run(dialog!, extra)}
      />
    </div>
  );
}
