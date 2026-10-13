"use client";

import { Loader2 } from "lucide-react";
import { useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";

import { FormAlert } from "@/components/auth/form-alert";
import {
  ApproveWithPaymentDialog,
  DeliverWithBalanceDialog,
  type ApprovalPayment,
} from "@/components/payments/piece-payment-dialogs";
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
  canReceiveFromWorkshop,
  canReturnToClient,
  isClosedStatus,
  PIECE_STATUS_LABELS,
  type PieceStatus,
  type PieceTransition,
} from "@/domain/piece-state-machine";
import type { PieceLocation } from "@/domain/restoration-status";
import type { AppRole } from "@/lib/roles";
import {
  changePieceStatus,
  markPiecesArrived,
  receiveFromWorkshop,
  returnPiecesToClient,
} from "@/server/restorations/status-actions";

import { ROW_LABEL_CLASS } from "./guide-labels";
import type { WorkshopOption } from "./piece-fields";
import { LocationBadge, PieceStatusBadge, UrgentBadge } from "./status-badges";

/** Texto del botón de cada cambio de estado (por estado de destino). */
export const ACTION_LABELS: Record<PieceStatus, string> = {
  registrada: "Registrar",
  en_consulta: "Poner en consulta",
  en_espera: "Esperar respuesta",
  aprobada: "Aprobar",
  enviada_taller: "Enviar al taller",
  observada: "Observar",
  entregada: "Entregar",
  rechazada: "Rechazar",
  sin_arreglo: "No tiene arreglo",
  anulada: "Anular",
};

export type StatusPiece = {
  id: string;
  code: string;
  status: PieceStatus;
  location: PieceLocation;
  arrivedAt: string | null;
  workshopId: string | null;
  /** En Interno y ya de vuelta del taller (P47). */
  readyForDelivery: boolean;
  returnedAt: string | null;
  urgent: boolean;
};

/** Lo que la máquina de estados necesita de una pieza de la interfaz. */
export const snapshotOf = (piece: StatusPiece) => ({
  status: piece.status,
  arrivedAt: piece.arrivedAt ? new Date(piece.arrivedAt) : null,
  readyForDelivery: piece.readyForDelivery,
  returnedAt: piece.returnedAt ? new Date(piece.returnedAt) : null,
});

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

/** Necesita diálogo: nota, taller o una acción que no se deshace (estados finales). */
export const needsDialog = (change: PendingChange) =>
  change.requiresNote || change.requiresWorkshop || isClosedStatus(change.to);

/** Ubicación que se muestra al instante (optimista) tras pasar a `to`. */
export function locationAfter(
  to: PieceStatus,
  location: PieceLocation,
): PieceLocation {
  switch (to) {
    case "enviada_taller":
      return "en_taller";
    case "entregada":
      return "entregada";
    case "anulada":
      return "anulada";
    case "observada":
      return "sin_enviar";
    default:
      return location;
  }
}

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
            {isClosedStatus(change.to)
              ? " Es un estado final: la pieza no se puede reactivar ni se cobra."
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
            variant={isClosedStatus(change.to) ? "destructive" : "default"}
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

/** Una acción sobre una pieza: botón en el panel o ítem del menú «Acciones». */
export type PieceAction = {
  key: string;
  label: string;
  onSelect: () => void;
  disabled: boolean;
  /** Lleva a un estado final (anular, rechazar…): se resalta en rojo. */
  destructive: boolean;
};

export type PieceActionsInput = {
  restorationId: string;
  piece: StatusPiece;
  role: AppRole;
  workshops: WorkshopOption[];
  /** Es la última pieza por aprobar: "Aprobar" ofrece registrar el adelanto (11.2). */
  approvalPayment?: ApprovalPayment | null;
  /** Falta cobrar el saldo: "Entregar" se bloquea o pide confirmarlo (P45). */
  balanceDue?: boolean;
};

/**
 * Acciones que el rol puede hacer sobre una pieza y sus diálogos (Pasos 8.4 y 8.6).
 * El cambio se ve al instante (optimista) y vuelve atrás si la BD lo rechaza.
 * Llegada, vuelta del taller y devolución no cambian el estado: solo la ubicación
 * (P47). Lo usan el panel del detalle de la pieza y el menú de la tabla de la guía.
 */
export function usePieceActions({
  restorationId,
  piece,
  role,
  workshops,
  approvalPayment = null,
  balanceDue = false,
}: PieceActionsInput) {
  const [optimistic, setOptimistic] = useOptimistic(
    piece,
    (state, changes: Partial<StatusPiece>) => ({ ...state, ...changes }),
  );
  const [pending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<PendingChange | null>(null);
  const [paymentDialog, setPaymentDialog] = useState<
    "aprobar" | "entregar" | null
  >(null);
  const canConfirmBalance = role === "admin" || role === "ventas";

  const snapshot = snapshotOf(piece);
  const transitions = availableTransitions(snapshot, role);
  const arrival = canMarkArrived(snapshot, role);
  const receive = canReceiveFromWorkshop(snapshot, role);
  const giveBack = canReturnToClient(snapshot, role);

  const run = (
    change: PendingChange,
    extra = { note: null as string | null, workshopId: null as string | null },
  ) =>
    new Promise<string | null>((resolve) => {
      startTransition(async () => {
        setOptimistic({
          status: change.to,
          location: locationAfter(change.to, piece.location),
          readyForDelivery: false,
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

  /** Acción que no cambia el estado: optimista y con aviso. */
  const act = (
    changes: Partial<StatusPiece>,
    call: () => Promise<{ ok: true } | { error: string }>,
    message: string,
  ) =>
    startTransition(async () => {
      setOptimistic(changes);
      const result = await call();
      if ("error" in result) toast.error(result.error);
      else toast.success(`${piece.code}: ${message}`);
    });

  const actions: PieceAction[] = [];
  if (arrival) {
    actions.push({
      key: "llegada",
      label: "Marcar llegada a tienda",
      disabled: pending,
      destructive: false,
      onSelect: () =>
        act(
          { arrivedAt: new Date().toISOString(), location: "sin_enviar" },
          () => markPiecesArrived(restorationId, [piece.id]),
          "llegó a la tienda.",
        ),
    });
  }
  if (receive) {
    actions.push({
      key: "recibir",
      label: "Recibir del taller",
      disabled: pending,
      destructive: false,
      onSelect: () =>
        act(
          { readyForDelivery: true, location: "en_tienda" },
          () => receiveFromWorkshop(restorationId, [piece.id]),
          "volvió del taller.",
        ),
    });
  }
  if (giveBack) {
    actions.push({
      key: "devolver",
      label: "Devolver al cliente",
      disabled: pending,
      destructive: false,
      onSelect: () =>
        act(
          { returnedAt: new Date().toISOString(), location: "entregada" },
          () => returnPiecesToClient(restorationId, [piece.id]),
          "devuelta al cliente.",
        ),
    });
  }
  for (const t of transitions) {
    const change = requirementsFor([t])!;
    actions.push({
      key: t.to,
      label: ACTION_LABELS[t.to],
      disabled:
        pending || (t.to === "entregada" && balanceDue && !canConfirmBalance),
      destructive: isClosedStatus(t.to),
      onSelect: () => {
        if (t.to === "aprobada" && approvalPayment)
          return setPaymentDialog("aprobar");
        if (t.to === "entregada" && balanceDue)
          return setPaymentDialog("entregar");
        return needsDialog(change) ? setDialog(change) : void run(change);
      },
    });
  }

  const dialogs = (
    <>
      {approvalPayment ? (
        <ApproveWithPaymentDialog
          key={
            paymentDialog === "aprobar" ? "aprobar-abierto" : "aprobar-cerrado"
          }
          open={paymentDialog === "aprobar"}
          onOpenChange={(open) => !open && setPaymentDialog(null)}
          restorationId={restorationId}
          pieceId={piece.id}
          pieceCode={piece.code}
          payment={approvalPayment}
          onDone={() => undefined}
        />
      ) : null}
      {balanceDue && canConfirmBalance ? (
        <DeliverWithBalanceDialog
          key={
            paymentDialog === "entregar"
              ? "entregar-abierto"
              : "entregar-cerrado"
          }
          open={paymentDialog === "entregar"}
          onOpenChange={(open) => !open && setPaymentDialog(null)}
          restorationId={restorationId}
          pieceIds={[piece.id]}
          subject={piece.code}
          onDone={() => undefined}
        />
      ) : null}
      <StatusChangeDialog
        key={dialog?.to ?? "estado-cerrado"}
        open={dialog !== null}
        onOpenChange={(open) => !open && setDialog(null)}
        change={dialog}
        pieces={[piece]}
        workshops={workshops}
        onConfirm={(extra) => run(dialog!, extra)}
      />
    </>
  );

  return {
    /** La pieza con los cambios optimistas aplicados. */
    piece: optimistic,
    pending,
    actions,
    /** "Entregar" está disponible pero falta cobrar el saldo (P45). */
    balanceWarning: balanceDue && transitions.some((t) => t.to === "entregada"),
    dialogs,
  };
}

/**
 * Estado, ubicación y acciones de una pieza (detalle de la pieza). Solo muestra lo
 * que el rol puede hacer (ver `usePieceActions`).
 */
export function PieceStatusPanel(props: PieceActionsInput) {
  const {
    piece: optimistic,
    pending,
    actions,
    balanceWarning,
    dialogs,
  } = usePieceActions(props);
  const { piece } = props;

  return (
    <div className="space-y-2">
      {/* Estado y ubicación: solo informan (insignias, no se pulsan). */}
      <div className="flex flex-wrap items-center gap-2">
        <span className={ROW_LABEL_CLASS}>Estado</span>
        <PieceStatusBadge status={optimistic.status} />
        <LocationBadge location={optimistic.location} />
        {optimistic.urgent ? <UrgentBadge /> : null}
        {pending ? (
          <Loader2
            className="text-muted-foreground size-4 animate-spin"
            aria-label="Guardando"
          />
        ) : null}
      </div>
      {actions.length > 0 ? (
        <div
          className="flex flex-wrap items-center gap-2"
          aria-label={`Acciones de ${piece.code}`}
          role="group"
        >
          {/* Rótulo visible; el grupo ya tiene su nombre accesible. */}
          <span className={ROW_LABEL_CLASS} aria-hidden>
            Acciones
          </span>
          {actions.map((a) => (
            <Button
              key={a.key}
              size="sm"
              variant={a.destructive ? "ghost" : "outline"}
              className={a.destructive ? "text-destructive" : undefined}
              disabled={a.disabled}
              onClick={a.onSelect}
            >
              {a.label}
            </Button>
          ))}
        </div>
      ) : null}
      {balanceWarning ? (
        <p className="text-destructive text-sm">Falta cobrar el saldo</p>
      ) : null}
      {dialogs}
    </div>
  );
}
