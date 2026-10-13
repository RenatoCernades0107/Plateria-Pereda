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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { checkMove, isLastToApprove, moveTargets } from "@/domain/piece-moves";
import {
  PIECE_STATUS_LABELS,
  type PieceStatus,
} from "@/domain/piece-state-machine";
import type { AppRole } from "@/lib/roles";
import { changePieceStatus } from "@/server/restorations/status-actions";

import type { WorkshopOption } from "./piece-fields";
import {
  locationAfter,
  needsDialog,
  requirementsFor,
  snapshotOf,
  StatusChangeDialog,
  type PendingChange,
  type StatusPiece,
} from "./piece-status-actions";

type Optimistic = Pick<StatusPiece, "id" | "status" | "location">;

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
        p.id === change.id ? { ...p, ...change, readyForDelivery: false } : p,
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
  const canConfirmBalance = role === "admin" || role === "ventas";

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
          toast.success(`${piece.code}: ${PIECE_STATUS_LABELS[change.to]}.`);
          resolve(null);
        }
      });
    });

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

  const drag: KanbanDrag<P> = {
    getId: (piece) => piece.id,
    getLabel: (piece) => piece.code,
    canDrop: (piece, column) => targets(piece).includes(column as PieceStatus),
    onMove: (piece, column) => move(piece, column as PieceStatus),
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

  return { pieces: optimistic, targets, move, drag, dialogs };
}

/** Alternativa a arrastrar: menú con los estados a los que puede pasar la pieza. */
export function MoveToMenu({
  code,
  targets,
  onMove,
}: {
  code: string;
  targets: readonly PieceStatus[];
  onMove: (to: PieceStatus) => void;
}) {
  if (targets.length === 0) return null;
  return (
    // Sin modo modal: el menú se cierra sin bloquear el diálogo que abra la opción.
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Mover ${code} a…`}
          title="Mover a…"
        >
          <ArrowRightLeft aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Mover a…</DropdownMenuLabel>
        {targets.map((to) => (
          <DropdownMenuItem key={to} onSelect={() => onMove(to)}>
            {PIECE_STATUS_LABELS[to]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
