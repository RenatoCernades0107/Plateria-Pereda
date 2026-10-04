import type { AppRole } from "@/lib/roles";

import { can, type Permission } from "./permissions";

/**
 * Máquina de estados de la pieza (Todo.md §7.1, P17, P41 y P42).
 * La tabla `piece_status_transitions` de la BD (Paso 8.3) se siembra con
 * `PIECE_TRANSITIONS` y un test de integración verifica que sean idénticas.
 */

export const PIECE_STATUSES = [
  "registrada",
  "en_consulta",
  "en_espera",
  "aprobada",
  "recibida",
  "enviada_taller",
  "devuelta_taller",
  "observada",
  "entregada",
  "anulada",
] as const;
export type PieceStatus = (typeof PIECE_STATUSES)[number];

export const PIECE_STATUS_LABELS: Record<PieceStatus, string> = {
  registrada: "Registrada",
  en_consulta: "En consulta",
  en_espera: "En espera de respuesta del cliente",
  aprobada: "Aprobada",
  recibida: "Recibida",
  enviada_taller: "Enviada al taller",
  devuelta_taller: "Devuelta por el taller",
  observada: "Observada",
  entregada: "Entregada",
  anulada: "Anulada",
};

export type PieceTransition = {
  from: PieceStatus;
  to: PieceStatus;
  roles: readonly AppRole[];
  requiresNote: boolean;
  requiresWorkshop: boolean;
};

const ROLES: readonly AppRole[] = ["admin", "ventas", "logistica"];
const rolesWith = (permission: Permission) =>
  ROLES.filter((role) => can(role, permission));

const CONSULTAR_APROBAR_ANULAR = rolesWith("piezas.consultar-aprobar-anular");
const MARCAR_LLEGADA = rolesWith("piezas.marcar-llegada");
const TALLER = rolesWith("piezas.enviar-recibir-taller");
const ENTREGAR_OBSERVAR = rolesWith("piezas.entregar-observar");
/** P41 (d): una pieza que está en el taller solo la anula el administrador. */
const SOLO_ADMIN: readonly AppRole[] = ["admin"];

const transition = (
  from: PieceStatus,
  to: PieceStatus,
  roles: readonly AppRole[],
  requires: { note?: boolean; workshop?: boolean } = {},
): PieceTransition => ({
  from,
  to,
  roles,
  requiresNote: requires.note ?? false,
  requiresWorkshop: requires.workshop ?? false,
});

/** Se puede anular desde cualquier estado excepto Entregada (y Anulada, que es final). */
const CANCELLABLE_FROM: readonly PieceStatus[] = [
  "registrada",
  "en_consulta",
  "en_espera",
  "aprobada",
  "recibida",
  "enviada_taller",
  "devuelta_taller",
  "observada",
];

export const PIECE_TRANSITIONS: readonly PieceTransition[] = [
  transition("registrada", "en_consulta", CONSULTAR_APROBAR_ANULAR, {
    note: true,
  }),
  transition("registrada", "aprobada", CONSULTAR_APROBAR_ANULAR),
  transition("en_consulta", "en_espera", CONSULTAR_APROBAR_ANULAR),
  transition("en_espera", "aprobada", CONSULTAR_APROBAR_ANULAR),
  transition("aprobada", "recibida", MARCAR_LLEGADA),
  transition("recibida", "enviada_taller", TALLER, { workshop: true }),
  transition("enviada_taller", "devuelta_taller", TALLER),
  transition("devuelta_taller", "entregada", ENTREGAR_OBSERVAR),
  transition("devuelta_taller", "observada", ENTREGAR_OBSERVAR, {
    note: true,
  }),
  transition("observada", "enviada_taller", TALLER, { workshop: true }),
  transition("entregada", "observada", ENTREGAR_OBSERVAR, { note: true }),
  ...CANCELLABLE_FROM.map((from) =>
    transition(
      from,
      "anulada",
      from === "enviada_taller" ? SOLO_ADMIN : CONSULTAR_APROBAR_ANULAR,
      { note: true },
    ),
  ),
];

export function findTransition(
  from: PieceStatus,
  to: PieceStatus,
): PieceTransition | undefined {
  return PIECE_TRANSITIONS.find((t) => t.from === from && t.to === to);
}

/** Datos de la pieza que la máquina de estados necesita. */
export type PieceSnapshot = {
  status: PieceStatus;
  arrivedAt: Date | null;
  workshopId: string | null;
  firstSentAt: Date | null;
};

/**
 * Transiciones que el rol puede ejecutar sobre la pieza.
 * Aprobada → Recibida no se ofrece aquí: se hace con "Marcar llegada a tienda".
 */
export function availableTransitions(
  piece: Pick<PieceSnapshot, "status">,
  role: AppRole,
): PieceTransition[] {
  return PIECE_TRANSITIONS.filter(
    (t) =>
      t.from === piece.status &&
      t.roles.includes(role) &&
      !(t.from === "aprobada" && t.to === "recibida"),
  );
}

/** Cambios que se guardan en la pieza; las fechas que no cambian no se incluyen. */
export type PieceChanges = {
  status: PieceStatus;
  workshopId?: string;
  arrivedAt?: Date;
  approvedAt?: Date;
  receivedAt?: Date;
  firstSentAt?: Date;
  lastReturnedAt?: Date;
  deliveredAt?: Date;
  cancelledAt?: Date;
};

/** Un paso del historial (`piece_status_history`). */
export type PieceStatusStep = { from: PieceStatus; to: PieceStatus };

export type TransitionError =
  | "transicion_invalida"
  | "rol_no_permitido"
  | "nota_requerida"
  | "taller_requerido";

export const TRANSITION_ERROR_MESSAGES: Record<TransitionError, string> = {
  transicion_invalida: "La pieza no puede pasar a ese estado.",
  rol_no_permitido: "Tu rol no puede hacer este cambio de estado.",
  nota_requerida: "Escribe una nota para este cambio de estado.",
  taller_requerido: "Elige el taller al que se envía la pieza.",
};

export type TransitionResult =
  | {
      ok: true;
      changes: PieceChanges;
      steps: PieceStatusStep[];
      note: string | null;
    }
  | { ok: false; error: TransitionError };

export type TransitionInput = {
  to: PieceStatus;
  role: AppRole;
  note?: string | null;
  workshopId?: string | null;
  now: Date;
};

/** Fecha que fija cada estado al entrar en él (§7.4). */
function datesFor(
  to: PieceStatus,
  now: Date,
  firstSentAt: Date | null,
): Partial<PieceChanges> {
  switch (to) {
    case "aprobada":
      return { approvedAt: now };
    case "recibida":
      return { receivedAt: now };
    case "enviada_taller":
      return firstSentAt ? {} : { firstSentAt: now };
    case "devuelta_taller":
      return { lastReturnedAt: now };
    case "entregada":
      return { deliveredAt: now };
    case "anulada":
      return { cancelledAt: now };
    default:
      return {};
  }
}

/**
 * Valida y aplica una transición. Devuelve el nuevo estado con sus fechas y los
 * pasos para el historial: aprobar una pieza que ya llegó a tienda la deja en
 * Recibida (dos pasos: → Aprobada → Recibida).
 */
export function applyTransition(
  piece: PieceSnapshot,
  input: TransitionInput,
): TransitionResult {
  const t = findTransition(piece.status, input.to);
  if (!t) return { ok: false, error: "transicion_invalida" };
  if (!t.roles.includes(input.role))
    return { ok: false, error: "rol_no_permitido" };

  const note = input.note?.trim() || null;
  if (t.requiresNote && !note) return { ok: false, error: "nota_requerida" };

  const workshopId = input.workshopId ?? piece.workshopId;
  if (t.requiresWorkshop && !workshopId)
    return { ok: false, error: "taller_requerido" };

  const steps: PieceStatusStep[] = [{ from: t.from, to: t.to }];
  let changes: PieceChanges = {
    status: t.to,
    ...datesFor(t.to, input.now, piece.firstSentAt),
  };
  if (t.requiresWorkshop && input.workshopId)
    changes.workshopId = input.workshopId;
  if (t.to === "recibida" && !piece.arrivedAt) changes.arrivedAt = input.now;

  if (t.to === "aprobada" && piece.arrivedAt) {
    steps.push({ from: "aprobada", to: "recibida" });
    changes = { ...changes, status: "recibida", receivedAt: input.now };
  }

  return { ok: true, changes, steps, note };
}

/** Estados en los que se puede "Marcar llegada a tienda" (§7.1). */
const ARRIVAL_STATUSES: readonly PieceStatus[] = [
  "registrada",
  "en_consulta",
  "en_espera",
  "aprobada",
];

export function canMarkArrived(
  piece: Pick<PieceSnapshot, "status" | "arrivedAt">,
  role: AppRole,
): boolean {
  return (
    !piece.arrivedAt &&
    ARRIVAL_STATUSES.includes(piece.status) &&
    MARCAR_LLEGADA.includes(role)
  );
}

/**
 * Registra la llegada física a la tienda. Si la pieza ya estaba Aprobada pasa a
 * Recibida; en los demás estados solo guarda la fecha de llegada.
 */
export function markArrived(
  piece: PieceSnapshot,
  role: AppRole,
  now: Date,
): TransitionResult {
  if (!canMarkArrived(piece, role)) {
    return {
      ok: false,
      error: MARCAR_LLEGADA.includes(role)
        ? "transicion_invalida"
        : "rol_no_permitido",
    };
  }
  if (piece.status === "aprobada") {
    return applyTransition(piece, { to: "recibida", role, now });
  }
  return {
    ok: true,
    changes: { status: piece.status, arrivedAt: now },
    steps: [],
    note: null,
  };
}
