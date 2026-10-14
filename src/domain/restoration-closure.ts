import type { AppRole } from "@/lib/roles";

import {
  applyTransition,
  isClosedStatus,
  PIECE_STATUS_LABELS,
  TRANSITION_ERROR_MESSAGES,
  type PieceSnapshot,
  type PieceStatus,
} from "./piece-state-machine";
import {
  deriveRestorationStatus,
  type RestorationStatus,
} from "./restoration-status";

/**
 * Cambio manual del estado general: solo a Anulada o Rechazada. Los demás estados
 * se calculan de las piezas (§7.3), así que cerrar la guía es anular o rechazar
 * todas sus piezas vivas con la máquina de estados; el trigger de la BD deriva el
 * estado general. Las piezas ya cerradas (anuladas, rechazadas, sin arreglo) se
 * dejan como están; si alguna pieza viva no puede pasar al estado, no se cambia nada.
 */
export const RESTORATION_CLOSE_TARGETS = ["anulada", "rechazada"] as const;
export type RestorationCloseTarget = (typeof RESTORATION_CLOSE_TARGETS)[number];

export function isRestorationCloseTarget(
  value: unknown,
): value is RestorationCloseTarget {
  return (RESTORATION_CLOSE_TARGETS as readonly unknown[]).includes(value);
}

export const CLOSE_TARGET_LABELS: Record<
  RestorationCloseTarget,
  { action: string; verb: string; done: string }
> = {
  anulada: { action: "Anular restauración", verb: "anular", done: "anuladas" },
  rechazada: {
    action: "Rechazar restauración",
    verb: "rechazar",
    done: "rechazadas",
  },
};

export type ClosurePiece = Pick<
  PieceSnapshot,
  | "status"
  | "arrivedAt"
  | "workshopId"
  | "firstSentAt"
  | "readyForDelivery"
  | "returnedAt"
> & {
  id: string;
  code: string;
  approvedAt: Date | null;
};

export type ClosurePlan =
  | {
      ok: true;
      /** Piezas que cambian de estado. */
      pieceIds: string[];
      /** Piezas ya cerradas que se dejan como están. */
      skipped: number;
      /** Estado general que resulta (con piezas ya rechazadas, anular deja Rechazada). */
      result: RestorationStatus;
    }
  | { ok: false; error: string };

/** Valida el cierre de la guía pieza por pieza, sin cambiar nada. */
export function planRestorationClosure(
  pieces: readonly ClosurePiece[],
  to: RestorationCloseTarget,
  role: AppRole,
  options: { note?: string | null; now?: Date } = {},
): ClosurePlan {
  const { verb } = CLOSE_TARGET_LABELS[to];
  const note = options.note?.trim() ?? "";
  if (!note)
    return {
      ok: false,
      error: `Escribe el motivo para ${verb} la restauración.`,
    };
  if (pieces.length === 0)
    return { ok: false, error: "La restauración no tiene piezas." };
  const open = pieces.filter((p) => !isClosedStatus(p.status));
  if (open.length === 0)
    return {
      ok: false,
      error: "Todas las piezas ya están anuladas, rechazadas o sin arreglo.",
    };

  const now = options.now ?? new Date();
  const blocked: string[] = [];
  let roleBlocked = false;
  for (const p of open) {
    const r = applyTransition(p, { to, role, note, now });
    if (r.ok) continue;
    if (r.error === "rol_no_permitido") roleBlocked = true;
    blocked.push(
      `${p.code} (${PIECE_STATUS_LABELS[p.status]}${
        r.error === "transicion_invalida"
          ? ""
          : `: ${TRANSITION_ERROR_MESSAGES[r.error].replace(/\.$/, "").toLowerCase()}`
      })`,
    );
  }
  if (blocked.length > 0) {
    const why =
      to === "rechazada"
        ? 'Solo se rechazan piezas en "Espera respuesta cliente".'
        : roleBlocked
          ? "Las piezas en el taller solo las anula el administrador; las entregadas no se anulan."
          : "Las piezas entregadas no se anulan.";
    return {
      ok: false,
      error: `No se puede ${verb} la restauración: ${blocked.join(", ")}. ${why}`,
    };
  }

  const result = deriveRestorationStatus(
    pieces.map((p) => ({
      status: isClosedStatus(p.status) ? p.status : (to as PieceStatus),
      approvedAt: p.approvedAt,
      firstSentAt: p.firstSentAt,
      readyForDelivery: p.readyForDelivery,
    })),
  );
  return {
    ok: true,
    pieceIds: open.map((p) => p.id),
    skipped: pieces.length - open.length,
    result,
  };
}
