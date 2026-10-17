import type { AppRole } from "@/lib/roles";

import {
  availableTransitions,
  blockedBy,
  type BlockSnapshot,
  findTransition,
  PIECE_STATUS_LABELS,
  PIECE_STATUSES,
  TRANSITION_ERROR_MESSAGES,
  type PieceStatus,
  type PieceTransition,
} from "./piece-state-machine";

/**
 * Mover piezas entre columnas de los kanban de piezas (Paso 12.5): arrastrando o con
 * "Mover a…". Usa la misma máquina de estados que los botones de la pieza.
 */
type MoveSnapshot = BlockSnapshot;

/** Estados a los que el rol puede mover la pieza ahora. */
export function moveTargets(piece: MoveSnapshot, role: AppRole): PieceStatus[] {
  return availableTransitions(piece, role).map((t) => t.to);
}

export type MoveCheck =
  { ok: true; transition: PieceTransition } | { ok: false; reason: string };

/** Valida el cambio y, si no se puede, explica por qué (para el aviso al soltar). */
export function checkMove(
  piece: MoveSnapshot,
  to: PieceStatus,
  role: AppRole,
): MoveCheck {
  const allowed = availableTransitions(piece, role).find((t) => t.to === to);
  if (allowed) return { ok: true, transition: allowed };

  const from = PIECE_STATUS_LABELS[piece.status];
  const target = PIECE_STATUS_LABELS[to];
  const transition = findTransition(piece.status, to);
  if (!transition)
    return {
      ok: false,
      reason: `No se puede pasar de «${from}» a «${target}».`,
    };
  if (!transition.roles.includes(role))
    return {
      ok: false,
      reason: `Tu rol no puede pasar piezas de «${from}» a «${target}».`,
    };
  const blocked = blockedBy(piece, to, role);
  return {
    ok: false,
    reason: blocked
      ? TRANSITION_ERROR_MESSAGES[blocked]
      : `No se puede pasar de «${from}» a «${target}».`,
  };
}

/**
 * Columnas de un kanban de piezas: las visibles y, solo mientras se arrastra, los
 * demás estados como destino (p. ej. Entregada o Anulado cuando no tienen piezas).
 */
export function pieceKanbanColumns(
  visible: readonly PieceStatus[],
): { status: PieceStatus; dropOnly: boolean }[] {
  return PIECE_STATUSES.map((status) => ({
    status,
    dropOnly: !visible.includes(status),
  }));
}

/** Estados antes de aprobar: la última pieza en ellos crea la orden al aprobarse (11.2). */
export const PRE_APPROVAL_STATUSES: readonly PieceStatus[] = [
  "registrada",
  "en_consulta",
  "en_espera",
];

/** La pieza es la única que falta aprobar (aprobarla ofrece registrar el adelanto). */
export function isLastToApprove(
  pieces: readonly { id: string; status: PieceStatus }[],
  pieceId: string,
): boolean {
  const toApprove = pieces.filter((p) =>
    PRE_APPROVAL_STATUSES.includes(p.status),
  );
  return toApprove.length === 1 && toApprove[0]!.id === pieceId;
}
