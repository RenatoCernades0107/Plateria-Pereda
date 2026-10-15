"use client";

import { Loader2, MoreHorizontal } from "lucide-react";
import { useOptimistic, useRef, useState, useTransition } from "react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  canReceiveFromReview,
  canReceiveFromWorkshop,
  canReturnToClient,
  canSendForReview,
  isClosedStatus,
  PIECE_STATUS_LABELS,
  type PieceStatus,
  type PieceTransition,
} from "@/domain/piece-state-machine";
import type { PieceLocation } from "@/domain/restoration-status";
import type { AppRole } from "@/lib/roles";
import { cn } from "@/lib/utils";
import {
  changePieceStatus,
  markPiecesArrived,
  receiveFromWorkshop,
  receivePiecesFromReview,
  returnPiecesToClient,
  sendPiecesForReview,
} from "@/server/restorations/status-actions";

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
  /** En En restauración y ya de vuelta del taller (P47). */
  readyForDelivery: boolean;
  returnedAt: string | null;
  urgent: boolean;
  /** Revisión en taller: último envío a revisar y última vuelta. */
  reviewSentAt?: string | null;
  reviewReturnedAt?: string | null;
};

const dateOrNull = (value: string | null | undefined) =>
  value ? new Date(value) : null;

/** Lo que la máquina de estados necesita de una pieza de la interfaz. */
export const snapshotOf = (piece: StatusPiece) => ({
  status: piece.status,
  arrivedAt: dateOrNull(piece.arrivedAt),
  readyForDelivery: piece.readyForDelivery,
  returnedAt: dateOrNull(piece.returnedAt),
  reviewSentAt: dateOrNull(piece.reviewSentAt),
  reviewReturnedAt: dateOrNull(piece.reviewReturnedAt),
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

/** Taller a elegir entre los activos (cambio de estado y revisión en taller). */
function WorkshopSelect({
  id,
  value,
  onChange,
  workshops,
}: {
  id: string;
  value: string | null;
  onChange: (workshopId: string | null) => void;
  workshops: WorkshopOption[];
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Taller</Label>
      <Select
        value={value ?? NONE}
        onValueChange={(v) => onChange(v === NONE ? null : v)}
      >
        <SelectTrigger id={id} className="w-full">
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
  );
}

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
            <WorkshopSelect
              id="cambio-taller"
              value={workshopId}
              onChange={setWorkshopId}
              workshops={workshops}
            />
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

/** Textos de la revisión en taller (sin cambiar el estado de la pieza). */
export const REVIEW_LABELS = {
  send: "Llevar al taller a revisar",
  back: "Volvió de revisión",
} as const;

/**
 * "Llevar al taller a revisar": se elige el taller (revisión en taller). La pieza
 * no cambia de estado; su ubicación pasa a En taller hasta que se marca que volvió.
 */
export function ReviewDialog({
  open,
  onOpenChange,
  pieces,
  workshops,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pieces: StatusPiece[];
  workshops: WorkshopOption[];
  onConfirm: (workshopId: string) => Promise<string | null>;
}) {
  const [workshopId, setWorkshopId] = useState<string | null>(
    pieces.length === 1 ? pieces[0]!.workshopId : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (pieces.length === 0) return null;

  const subject =
    pieces.length === 1 ? pieces[0]!.code : `${pieces.length} piezas`;
  const submit = () => {
    if (!workshopId) {
      setError("Elige el taller al que se lleva la pieza.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const message = await onConfirm(workshopId);
      if (message) {
        setError(message);
        return;
      }
      onOpenChange(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {REVIEW_LABELS.send}: {subject}
          </DialogTitle>
          <DialogDescription>
            Sigue en «{PIECE_STATUS_LABELS[pieces[0]!.status]}»; queda «En
            taller» hasta que marques que volvió. Si el cliente aprueba, pasa a
            En restauración en el mismo taller.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {error ? <FormAlert>{error}</FormAlert> : null}
          <WorkshopSelect
            id="revision-taller"
            value={workshopId}
            onChange={setWorkshopId}
            workshops={workshops}
          />
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Guardando…" : "Confirmar: llevar al taller"}
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
 * Llegada, vuelta del taller, devolución y la revisión en taller no cambian el
 * estado: solo la ubicación (P47). Lo usan el panel del detalle de la pieza y el menú de la tabla de la guía.
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
  const [reviewDialog, setReviewDialog] = useState(false);
  const [paymentDialog, setPaymentDialog] = useState<
    "aprobar" | "entregar" | null
  >(null);
  const canConfirmBalance = role === "admin" || role === "ventas";

  const snapshot = snapshotOf(piece);
  const transitions = availableTransitions(snapshot, role);
  const arrival = canMarkArrived(snapshot, role);
  const receive = canReceiveFromWorkshop(snapshot, role);
  const giveBack = canReturnToClient(snapshot, role);
  const toReview = canSendForReview(snapshot, role);
  const backFromReview = canReceiveFromReview(snapshot, role);

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

  /** "Llevar al taller a revisar" desde su diálogo: el mensaje de error o null. */
  const sendToReview = (workshopId: string) =>
    new Promise<string | null>((resolve) => {
      startTransition(async () => {
        setOptimistic({
          location: "en_taller",
          workshopId,
          reviewSentAt: new Date().toISOString(),
          reviewReturnedAt: null,
        });
        const result = await sendPiecesForReview(
          restorationId,
          [piece.id],
          workshopId,
        );
        if ("error" in result) {
          toast.error(result.error);
          resolve(result.error);
        } else {
          toast.success(`${piece.code}: llevada al taller a revisar.`);
          resolve(null);
        }
      });
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
  if (backFromReview) {
    actions.push({
      key: "vuelta_revision",
      label: REVIEW_LABELS.back,
      disabled: pending,
      destructive: false,
      onSelect: () =>
        act(
          {
            location: "en_tienda",
            reviewReturnedAt: new Date().toISOString(),
          },
          () => receivePiecesFromReview(restorationId, [piece.id]),
          "volvió de revisión.",
        ),
    });
  }
  if (toReview) {
    actions.push({
      key: "revision",
      label: REVIEW_LABELS.send,
      disabled: pending,
      destructive: false,
      onSelect: () => setReviewDialog(true),
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
      <ReviewDialog
        key={reviewDialog ? "revision-abierta" : "revision-cerrada"}
        open={reviewDialog}
        onOpenChange={setReviewDialog}
        pieces={[piece]}
        workshops={workshops}
        onConfirm={sendToReview}
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
 * Orden de preferencia de la acción principal (botón relleno): el siguiente paso
 * natural del flujo. Solo una acción se destaca; el resto va como secundaria.
 */
const PRIMARY_ORDER = [
  "entregada",
  "recibir",
  "vuelta_revision",
  "devolver",
  "aprobada",
  "enviada_taller",
  "llegada",
  "en_espera",
  "en_consulta",
  "revision",
] as const;

/**
 * Reparte las acciones en principal, secundarias y de cierre (destructivas). Los
 * cierres (anular, rechazar, no tiene arreglo) van aparte, en «Más acciones», salvo
 * que no haya ninguna otra acción: entonces se muestran como botones, para no
 * esconder la única acción posible. Todos piden confirmación en un diálogo.
 */
export function arrangeActions(actions: readonly PieceAction[]) {
  const regular = actions.filter((a) => !a.destructive);
  const closing = actions.filter((a) => a.destructive);
  const primary =
    PRIMARY_ORDER.map((key) => regular.find((a) => a.key === key)).find(
      (a) => a !== undefined,
    ) ?? null;
  return {
    primary,
    secondary: regular.filter((a) => a !== primary),
    /** Cierres en el menú «Más acciones» (si hay otras acciones). */
    overflow: regular.length > 0 ? closing : [],
    /** Cierres como botones (si son las únicas acciones). */
    inlineClosing: regular.length > 0 ? [] : closing,
  };
}

/** Insignias del detalle de la pieza: más grandes que en tablas y tarjetas. */
const LARGE_BADGE_CLASS = "px-2.5 py-1 text-sm [&>svg]:size-3.5";

/** Menú «Más acciones» con los cierres de la pieza, en rojo y apartados. */
function MoreActionsMenu({
  code,
  actions,
}: {
  code: string;
  actions: PieceAction[];
}) {
  // La acción corre al cerrarse el menú, así su diálogo recibe el foco.
  const chosen = useRef<(() => void) | null>(null);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="text-muted-foreground"
          title={`Más acciones de ${code}`}
        >
          <MoreHorizontal aria-hidden />
          Más acciones
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-48"
        onCloseAutoFocus={() => {
          const action = chosen.current;
          chosen.current = null;
          action?.();
        }}
      >
        <DropdownMenuLabel>Cerrar la pieza</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {actions.map((a) => (
          <DropdownMenuItem
            key={a.key}
            disabled={a.disabled}
            variant="destructive"
            onSelect={() => {
              chosen.current = a.onSelect;
            }}
          >
            {a.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Estado, ubicación y acciones de una pieza (detalle de la pieza). Solo muestra lo
 * que el rol puede hacer (ver `usePieceActions`).
 *
 * Jerarquía visual (Refactoring UI, NN/g, Material): el estado en insignias grandes y
 * agrupadas; una sola acción principal (botón relleno), las demás secundarias (con
 * borde) y los cierres, que no se deshacen, apartados en «Más acciones» y con
 * confirmación.
 */
export function PieceStatusPanel({
  className,
  ...props
}: PieceActionsInput & { className?: string }) {
  const {
    piece: optimistic,
    pending,
    actions,
    balanceWarning,
    dialogs,
  } = usePieceActions(props);
  const { piece } = props;
  const { primary, secondary, overflow, inlineClosing } =
    arrangeActions(actions);

  return (
    <div className={cn("space-y-4", className)}>
      {/* Estado y ubicación: solo informan (insignias, no se pulsan). */}
      <div className="space-y-1.5" data-testid="estado-pieza">
        <p className="text-muted-foreground text-xs font-medium">Estado</p>
        <div className="flex flex-wrap items-center gap-2">
          <PieceStatusBadge
            status={optimistic.status}
            className={LARGE_BADGE_CLASS}
          />
          <LocationBadge
            location={optimistic.location}
            className={LARGE_BADGE_CLASS}
          />
          {optimistic.urgent ? (
            <UrgentBadge className={LARGE_BADGE_CLASS} />
          ) : null}
          {pending ? (
            <Loader2
              className="text-muted-foreground size-4 animate-spin"
              aria-label="Guardando"
            />
          ) : null}
        </div>
      </div>
      {actions.length > 0 ? (
        <div className="space-y-2">
          <div
            className="flex flex-wrap items-center gap-2"
            aria-label={`Acciones de ${piece.code}`}
            role="group"
          >
            {primary ? (
              <Button disabled={primary.disabled} onClick={primary.onSelect}>
                {primary.label}
              </Button>
            ) : null}
            {secondary.map((a) => (
              <Button
                key={a.key}
                variant="outline"
                disabled={a.disabled}
                onClick={a.onSelect}
              >
                {a.label}
              </Button>
            ))}
            {inlineClosing.map((a) => (
              <Button
                key={a.key}
                variant="outline"
                className="text-destructive hover:text-destructive"
                disabled={a.disabled}
                onClick={a.onSelect}
              >
                {a.label}
              </Button>
            ))}
            {overflow.length > 0 ? (
              <div className="ml-auto">
                <MoreActionsMenu code={piece.code} actions={overflow} />
              </div>
            ) : null}
          </div>
          {balanceWarning ? (
            <p className="text-destructive text-sm">Falta cobrar el saldo</p>
          ) : null}
        </div>
      ) : null}
      {dialogs}
    </div>
  );
}
