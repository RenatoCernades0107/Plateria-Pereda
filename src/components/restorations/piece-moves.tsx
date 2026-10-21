"use client";

import { ArrowRightLeft } from "lucide-react";
import { useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";

import type { KanbanDrag } from "@/components/kanban-columns";
import {
  ApproveWithPaymentDialog,
  DeliverWithBalanceDialog,
  type ApprovalPayment,
} from "@/components/payments/piece-payment-dialogs";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { checkMove, isLastToApprove, moveTargets } from "@/domain/piece-moves";
import {
  canReceiveFromReview,
  canReceiveFromWorkshop,
  canSendForReview,
  canSendToWorkshop,
  PIECE_STATUS_LABELS,
  type PieceStatus,
} from "@/domain/piece-state-machine";
import type { PieceLocation } from "@/domain/restoration-status";
import type { AppRole } from "@/lib/roles";
import {
  changePieceStatus,
  type MoveActionResult,
  receiveFromWorkshop,
  receivePiecesFromReview,
  sendPiecesForReview,
  sendPiecesToWorkshop,
  undoPieceMove,
} from "@/server/restorations/status-actions";

import type { WorkshopOption } from "./piece-fields";
import {
  locationAfter,
  needsDialog,
  requirementsFor,
  REVIEW_LABELS,
  ReviewDialog,
  snapshotOf,
  StatusChangeDialog,
  WORKSHOP_LABELS,
  type PendingChange,
  type StatusPiece,
} from "./piece-status-actions";

type Optimistic = Pick<StatusPiece, "id" | "status" | "location"> &
  Partial<
    Pick<
      StatusPiece,
      | "workshopId"
      | "reviewSentAt"
      | "reviewReturnedAt"
      | "readyForDelivery"
      | "firstSentAt"
      | "lastSentAt"
      | "lastReturnedAt"
      | "observedAt"
    >
  >;

/** Cuánto dura el aviso con "Deshacer" tras mover una pieza. */
export const UNDO_TOAST_MS = 8000;

/** La pieza tal como estaba antes de moverla (lo que se ve mientras se deshace). */
const previousOf = (piece: StatusPiece): Optimistic => ({
  id: piece.id,
  status: piece.status,
  location: piece.location,
  workshopId: piece.workshopId,
  readyForDelivery: piece.readyForDelivery,
  reviewSentAt: piece.reviewSentAt ?? null,
  reviewReturnedAt: piece.reviewReturnedAt ?? null,
  firstSentAt: piece.firstSentAt ?? null,
  lastSentAt: piece.lastSentAt ?? null,
  lastReturnedAt: piece.lastReturnedAt ?? null,
  observedAt: piece.observedAt ?? null,
});

/**
 * Columnas de los kanban de piezas. "En restauración" y "Lista para entregar" ya no
 * son estados (2026-10-17): agrupan las Aprobadas u Observadas por su ubicación (en
 * el taller, o ya de vuelta en la tienda). Soltar una pieza en ellas la envía al
 * taller o la recibe de vuelta.
 */
export const IN_WORKSHOP_COLUMN = "en_restauracion";
export const READY_COLUMN = "lista_entregar";
export type PieceColumnKey =
  PieceStatus | typeof IN_WORKSHOP_COLUMN | typeof READY_COLUMN;

const WORKSHOP_STATUSES: readonly PieceStatus[] = ["aprobada", "observada"];

const COLUMN_ORDER: readonly PieceColumnKey[] = [
  "registrada",
  "en_consulta",
  "en_espera",
  "aprobada",
  IN_WORKSHOP_COLUMN,
  READY_COLUMN,
  "observada",
  "entregada",
  "rechazada",
  "sin_arreglo",
  "anulada",
];

export const PIECE_COLUMN_LABELS: Record<PieceColumnKey, string> = {
  ...PIECE_STATUS_LABELS,
  [IN_WORKSHOP_COLUMN]: "En restauración",
  [READY_COLUMN]: "Lista para entregar",
};

/** Columna de una pieza: su estado, o su ubicación si es Aprobada u Observada. */
export function pieceColumnOf(piece: {
  status: PieceStatus;
  location: PieceLocation;
  readyForDelivery: boolean;
}): PieceColumnKey {
  if (!WORKSHOP_STATUSES.includes(piece.status)) return piece.status;
  if (piece.location === "en_taller") return IN_WORKSHOP_COLUMN;
  if (piece.readyForDelivery) return READY_COLUMN;
  return piece.status;
}

/**
 * Columnas del tablero: las de los estados visibles (más las dos de ubicación si se
 * ven Aprobada u Observada) y, solo mientras se arrastra, las demás como destino.
 */
export function pieceBoardColumns(
  visible: readonly PieceStatus[],
): { key: PieceColumnKey; label: string; dropOnly: boolean }[] {
  const withWorkshop = WORKSHOP_STATUSES.some((s) => visible.includes(s));
  return COLUMN_ORDER.map((key) => ({
    key,
    label: PIECE_COLUMN_LABELS[key],
    dropOnly:
      key === IN_WORKSHOP_COLUMN || key === READY_COLUMN
        ? !withWorkshop
        : !visible.includes(key),
  }));
}

/** Acción de ubicación en el menú de la tarjeta (revisión en taller). */
export type CardAction = { key: string; label: string; onSelect: () => void };

/**
 * Mover piezas de estado desde un kanban (Paso 12.5): arrastrando o con "Mover a…".
 * Hace lo mismo que los botones de la pieza: pide nota o taller con el mismo
 * diálogo y, si hay datos de pagos (detalle de la restauración), ofrece el adelanto
 * al aprobar la última pieza o confirma la entrega con saldo pendiente. Sin esos
 * datos (vista de piezas) el cambio es el directo, como en las acciones masivas. El
 * cambio se ve al instante y vuelve atrás si la BD lo rechaza.
 */
export function usePieceMoves<P extends StatusPiece>({
  restorationId,
  pieces,
  role,
  workshops,
  approvalPayment = null,
  balanceDue = false,
}: {
  /** null = piezas de varias restauraciones (vista de piezas). */
  restorationId: string | null;
  pieces: P[];
  role: AppRole;
  workshops: WorkshopOption[];
  approvalPayment?: ApprovalPayment | null;
  balanceDue?: boolean;
}) {
  const [optimistic, setOptimistic] = useOptimistic(
    pieces,
    (state, change: Optimistic) =>
      state.map((p) =>
        p.id === change.id ? { ...p, readyForDelivery: false, ...change } : p,
      ),
  );
  const [, startTransition] = useTransition();
  const [dialog, setDialog] = useState<{
    piece: P;
    change: PendingChange;
  } | null>(null);
  const [payment, setPayment] = useState<{
    kind: "aprobar" | "entregar";
    piece: P;
  } | null>(null);
  const [review, setReview] = useState<P | null>(null);
  const [sending, setSending] = useState<P | null>(null);
  const canConfirmBalance = role === "admin" || role === "ventas";

  /**
   * "Deshacer" del aviso: la pieza vuelve a como estaba (se ve al instante) y la BD
   * repone su estado, fechas y taller y borra el movimiento del historial.
   */
  const undo = (piece: P, undoIds: number[]) =>
    startTransition(async () => {
      setOptimistic(previousOf(piece));
      const result = await undoPieceMove(restorationId, undoIds);
      if ("error" in result) toast.error(`${piece.code}: ${result.error}`);
      else toast.success("Movimiento deshecho");
    });

  /**
   * Aviso de éxito de un movimiento. Si la BD dice que se puede deshacer (lo hizo este
   * usuario y no tocó la orden de Shopify ni un pago), ofrece "Deshacer" unos segundos.
   */
  const notifyDone = (piece: P, message: string, result: MoveActionResult) => {
    const undoIds = "undoIds" in result ? result.undoIds : undefined;
    if (!undoIds?.length) {
      toast.success(message);
      return;
    }
    toast.success(message, {
      duration: UNDO_TOAST_MS,
      action: { label: "Deshacer", onClick: () => undo(piece, undoIds) },
    });
  };

  const run = (
    piece: P,
    change: PendingChange,
    extra = { note: null as string | null, workshopId: null as string | null },
  ) =>
    new Promise<string | null>((resolve) => {
      startTransition(async () => {
        setOptimistic({
          id: piece.id,
          status: change.to,
          location: locationAfter(change.to, piece.location),
        });
        const result = await changePieceStatus(
          restorationId,
          [piece.id],
          change.to,
          extra.note,
          extra.workshopId,
        );
        if ("error" in result) {
          toast.error(`${piece.code}: ${result.error}`);
          resolve(result.error);
        } else {
          notifyDone(
            piece,
            `${piece.code}: ${PIECE_STATUS_LABELS[change.to]}.`,
            result,
          );
          resolve(null);
        }
      });
    });

  /** Revisión en taller: ida (con el taller elegido) y vuelta; el estado no cambia. */
  const sendToReview = (piece: P, workshopId: string) =>
    new Promise<string | null>((resolve) => {
      startTransition(async () => {
        setOptimistic({
          id: piece.id,
          status: piece.status,
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
          toast.error(`${piece.code}: ${result.error}`);
          resolve(result.error);
        } else {
          notifyDone(
            piece,
            `${piece.code}: llevada al taller a revisar.`,
            result,
          );
          resolve(null);
        }
      });
    });
  const backFromReview = (piece: P) =>
    startTransition(async () => {
      setOptimistic({
        id: piece.id,
        status: piece.status,
        location: "en_tienda",
        reviewReturnedAt: new Date().toISOString(),
      });
      const result = await receivePiecesFromReview(restorationId, [piece.id]);
      if ("error" in result) toast.error(`${piece.code}: ${result.error}`);
      else notifyDone(piece, `${piece.code}: volvió de revisión.`, result);
    });

  /** "Enviar al taller" (con el taller elegido) y "Recibir del taller". */
  const sendToWorkshop = (piece: P, workshopId: string) =>
    new Promise<string | null>((resolve) => {
      startTransition(async () => {
        const now = new Date().toISOString();
        setOptimistic({
          id: piece.id,
          status: piece.status,
          location: "en_taller",
          workshopId,
          firstSentAt: piece.firstSentAt ?? now,
          lastSentAt: now,
        });
        const result = await sendPiecesToWorkshop([piece.id], workshopId);
        if ("error" in result) {
          toast.error(`${piece.code}: ${result.error}`);
          resolve(result.error);
        } else {
          notifyDone(piece, `${piece.code}: enviada al taller.`, result);
          resolve(null);
        }
      });
    });
  const backFromWorkshop = (piece: P) =>
    startTransition(async () => {
      setOptimistic({
        id: piece.id,
        status: piece.status,
        location: "en_tienda",
        readyForDelivery: true,
        lastReturnedAt: new Date().toISOString(),
      });
      const result = await receiveFromWorkshop(restorationId, [piece.id]);
      if ("error" in result) toast.error(`${piece.code}: ${result.error}`);
      else notifyDone(piece, `${piece.code}: volvió del taller.`, result);
    });

  /** Acciones de ubicación de la tarjeta (taller y revisión en taller). */
  const actions = (piece: P): CardAction[] => {
    const snapshot = snapshotOf(piece);
    const list: CardAction[] = [];
    if (canReceiveFromWorkshop(snapshot, role))
      list.push({
        key: "recibir",
        label: WORKSHOP_LABELS.back,
        onSelect: () => backFromWorkshop(piece),
      });
    if (canSendToWorkshop(snapshot, role))
      list.push({
        key: "enviar_taller",
        label: WORKSHOP_LABELS.send,
        onSelect: () => setSending(piece),
      });
    if (canReceiveFromReview(snapshot, role))
      list.push({
        key: "vuelta_revision",
        label: REVIEW_LABELS.back,
        onSelect: () => backFromReview(piece),
      });
    if (canSendForReview(snapshot, role))
      list.push({
        key: "revision",
        label: REVIEW_LABELS.send,
        onSelect: () => setReview(piece),
      });
    return list;
  };

  /** Estados a los que se puede mover la pieza ahora. */
  const targets = (piece: P) => moveTargets(snapshotOf(piece), role);

  /** Pasa la pieza a `to` o explica por qué no se puede. */
  const move = (piece: P, to: PieceStatus) => {
    if (to === piece.status) return;
    const check = checkMove(snapshotOf(piece), to, role);
    if (!check.ok) {
      toast.error(check.reason);
      return;
    }
    const change = requirementsFor([check.transition])!;
    if (
      to === "aprobada" &&
      approvalPayment &&
      restorationId &&
      isLastToApprove(pieces, piece.id)
    )
      return setPayment({ kind: "aprobar", piece });
    if (to === "entregada" && balanceDue) {
      if (canConfirmBalance) return setPayment({ kind: "entregar", piece });
      toast.error(
        `${piece.code}: falta cobrar el saldo. Solo ventas o el administrador entregan con saldo pendiente.`,
      );
      return;
    }
    if (needsDialog(change)) return setDialog({ piece, change });
    void run(piece, change);
  };

  /** Soltar en una columna: de ubicación (enviar o recibir) o de estado. */
  const drop = (piece: P, column: string) => {
    const snapshot = snapshotOf(piece);
    if (column === IN_WORKSHOP_COLUMN) {
      if (canSendToWorkshop(snapshot, role)) return setSending(piece);
      return void toast.error(
        `${piece.code}: solo se envía al taller una pieza Aprobada u Observada que está en la tienda.`,
      );
    }
    if (column === READY_COLUMN) {
      if (canReceiveFromWorkshop(snapshot, role))
        return backFromWorkshop(piece);
      return void toast.error(
        `${piece.code}: solo pasa a «Lista para entregar» al recibirla del taller.`,
      );
    }
    move(piece, column as PieceStatus);
  };

  const drag: KanbanDrag<P> = {
    getId: (piece) => piece.id,
    getLabel: (piece) => piece.code,
    canDrop: (piece, column) => {
      const snapshot = snapshotOf(piece);
      if (column === IN_WORKSHOP_COLUMN)
        return canSendToWorkshop(snapshot, role);
      if (column === READY_COLUMN)
        return canReceiveFromWorkshop(snapshot, role);
      return targets(piece).includes(column as PieceStatus);
    },
    onMove: drop,
  };

  const dialogs = (
    <>
      <StatusChangeDialog
        key={
          dialog ? `${dialog.piece.id}-${dialog.change.to}` : "mover-cerrado"
        }
        open={dialog !== null}
        onOpenChange={(open) => !open && setDialog(null)}
        change={dialog?.change ?? null}
        pieces={dialog ? [dialog.piece] : []}
        workshops={workshops}
        onConfirm={(extra) => run(dialog!.piece, dialog!.change, extra)}
      />
      <ReviewDialog
        key={sending ? `envio-${sending.id}` : "envio-cerrado"}
        kind="envio"
        open={sending !== null}
        onOpenChange={(open) => !open && setSending(null)}
        pieces={sending ? [sending] : []}
        workshops={workshops}
        onConfirm={(workshopId) => sendToWorkshop(sending!, workshopId)}
      />
      <ReviewDialog
        key={review ? `revision-${review.id}` : "revision-cerrada"}
        open={review !== null}
        onOpenChange={(open) => !open && setReview(null)}
        pieces={review ? [review] : []}
        workshops={workshops}
        onConfirm={(workshopId) => sendToReview(review!, workshopId)}
      />
      {approvalPayment && restorationId && payment?.kind === "aprobar" ? (
        <ApproveWithPaymentDialog
          key={`aprobar-${payment.piece.id}`}
          open
          onOpenChange={(open) => !open && setPayment(null)}
          restorationId={restorationId}
          pieceId={payment.piece.id}
          pieceCode={payment.piece.code}
          payment={approvalPayment}
          onDone={() => setPayment(null)}
        />
      ) : null}
      {canConfirmBalance && payment?.kind === "entregar" ? (
        <DeliverWithBalanceDialog
          key={`entregar-${payment.piece.id}`}
          open
          onOpenChange={(open) => !open && setPayment(null)}
          restorationId={restorationId}
          pieceIds={[payment.piece.id]}
          subject={payment.piece.code}
          onDone={() => setPayment(null)}
        />
      ) : null}
    </>
  );

  return { pieces: optimistic, targets, actions, move, drag, dialogs };
}

/**
 * Alternativa a arrastrar: menú con los estados a los que puede pasar la pieza y,
 * aparte, las acciones que solo cambian su ubicación (taller y revisión en taller).
 */
export function MoveToMenu({
  code,
  targets,
  onMove,
  actions = [],
}: {
  code: string;
  targets: readonly PieceStatus[];
  onMove: (to: PieceStatus) => void;
  actions?: readonly CardAction[];
}) {
  if (targets.length === 0 && actions.length === 0) return null;
  return (
    // Sin modo modal: el menú se cierra sin bloquear el diálogo que abra la opción.
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          className="pointer-coarse:size-9"
          aria-label={`Mover ${code} a…`}
          title="Mover a…"
        >
          <ArrowRightLeft aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {targets.length > 0 ? (
          <DropdownMenuLabel>Mover a…</DropdownMenuLabel>
        ) : null}
        {targets.map((to) => (
          <DropdownMenuItem key={to} onSelect={() => onMove(to)}>
            {PIECE_STATUS_LABELS[to]}
          </DropdownMenuItem>
        ))}
        {actions.length > 0 ? (
          <>
            {targets.length > 0 ? <DropdownMenuSeparator /> : null}
            <DropdownMenuLabel>Ubicación</DropdownMenuLabel>
            {actions.map((a) => (
              <DropdownMenuItem key={a.key} onSelect={a.onSelect}>
                {a.label}
              </DropdownMenuItem>
            ))}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
