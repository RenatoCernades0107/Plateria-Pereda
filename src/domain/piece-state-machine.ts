import type { AppRole } from "@/lib/roles";

import { can, type Permission } from "./permissions";

/**
 * Máquina de estados de la pieza (Todo.md §7.1, P17, P41, P42 y P47).
 * La tabla `piece_status_transitions` de la BD se siembra con `PIECE_TRANSITIONS`
 * y un test de integración verifica que sean idénticas.
 *
 * P47: "Recibida" y "Devuelta por el taller" ya no son estados. La llegada a la
 * tienda y la vuelta del taller son acciones que cambian la ubicación ("Marcar
 * llegada" y "Recibir del taller"); "Urgente" es una marca de la pieza.
 */

export const PIECE_STATUSES = [
  "registrada",
  "en_consulta",
  "en_espera",
  "aprobada",
  "enviada_taller",
  "observada",
  "entregada",
  "rechazada",
  "sin_arreglo",
  "anulada",
] as const;
export type PieceStatus = (typeof PIECE_STATUSES)[number];

export const PIECE_STATUS_LABELS: Record<PieceStatus, string> = {
  registrada: "Registrada",
  en_consulta: "Consulta",
  en_espera: "Espera respuesta cliente",
  aprobada: "Aprobada",
  enviada_taller: "Interno",
  observada: "Observación",
  entregada: "Entregada",
  rechazada: "Rechazado (cliente)",
  sin_arreglo: "No tiene arreglo",
  anulada: "Anulado",
};

/** Estados finales que no se cobran (P47): salen del total, del mensaje y de la orden. */
export const CLOSED_STATUSES: readonly PieceStatus[] = [
  "rechazada",
  "sin_arreglo",
  "anulada",
];

export function isClosedStatus(status: PieceStatus): boolean {
  return CLOSED_STATUSES.includes(status);
}

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
/** Devolver al cliente: igual que marcar llegada, todos los roles (P47). */
const DEVOLVER = MARCAR_LLEGADA;
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

/** Se puede anular desde cualquier estado excepto Entregada y los finales. */
const CANCELLABLE_FROM: readonly PieceStatus[] = [
  "registrada",
  "en_consulta",
  "en_espera",
  "aprobada",
  "enviada_taller",
  "observada",
];

/** Antes de aprobarse, el cliente o la tienda pueden rechazar la pieza (P47). */
const REJECTABLE_FROM: readonly PieceStatus[] = [
  "registrada",
  "en_consulta",
  "en_espera",
];

export const PIECE_TRANSITIONS: readonly PieceTransition[] = [
  transition("registrada", "en_consulta", CONSULTAR_APROBAR_ANULAR, {
    note: true,
  }),
  transition("registrada", "aprobada", CONSULTAR_APROBAR_ANULAR),
  transition("en_consulta", "en_espera", CONSULTAR_APROBAR_ANULAR),
  transition("en_espera", "aprobada", CONSULTAR_APROBAR_ANULAR),
  ...REJECTABLE_FROM.map((from) =>
    transition(from, "rechazada", CONSULTAR_APROBAR_ANULAR, { note: true }),
  ),
  transition("en_consulta", "sin_arreglo", CONSULTAR_APROBAR_ANULAR, {
    note: true,
  }),
  transition("aprobada", "enviada_taller", TALLER, { workshop: true }),
  transition("enviada_taller", "sin_arreglo", ENTREGAR_OBSERVAR, {
    note: true,
  }),
  transition("enviada_taller", "entregada", ENTREGAR_OBSERVAR),
  transition("enviada_taller", "observada", ENTREGAR_OBSERVAR, { note: true }),
  transition("entregada", "observada", ENTREGAR_OBSERVAR, { note: true }),
  transition("observada", "enviada_taller", TALLER, { workshop: true }),
  transition("observada", "entregada", ENTREGAR_OBSERVAR),
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
  /** En Interno y ya de vuelta del taller ("Lista para entregar"). */
  readyForDelivery: boolean;
  /** Devuelta al cliente (rechazada o sin arreglo). */
  returnedAt: Date | null;
};

/**
 * Condición física de la transición (P47): al taller solo va lo que está en la
 * tienda, y desde Interno solo se entrega u observa lo que ya volvió del taller.
 */
function blockedBy(
  piece: Pick<PieceSnapshot, "status" | "arrivedAt" | "readyForDelivery">,
  to: PieceStatus,
): TransitionError | null {
  if (to === "enviada_taller" && !piece.arrivedAt) return "no_llego";
  if (
    piece.status === "enviada_taller" &&
    (to === "entregada" || to === "observada") &&
    !piece.readyForDelivery
  )
    return "sigue_en_taller";
  return null;
}

/** Transiciones que el rol puede ejecutar ahora sobre la pieza. */
export function availableTransitions(
  piece: Pick<PieceSnapshot, "status" | "arrivedAt" | "readyForDelivery">,
  role: AppRole,
): PieceTransition[] {
  return PIECE_TRANSITIONS.filter(
    (t) =>
      t.from === piece.status &&
      t.roles.includes(role) &&
      !blockedBy(piece, t.to),
  );
}

/** Cambios que se guardan en la pieza; las fechas que no cambian no se incluyen. */
export type PieceChanges = {
  status: PieceStatus;
  workshopId?: string;
  arrivedAt?: Date;
  approvedAt?: Date;
  firstSentAt?: Date;
  lastSentAt?: Date;
  lastReturnedAt?: Date;
  deliveredAt?: Date;
  returnedAt?: Date;
  cancelledAt?: Date;
};

/** Evento del historial: un cambio de estado o una acción que no lo cambia. */
export type PieceEvent =
  "estado" | "llegada" | "vuelta_taller" | "devolucion_cliente";

/** Un paso del historial (`piece_status_history`). */
export type PieceStatusStep = {
  from: PieceStatus;
  to: PieceStatus;
  event: PieceEvent;
};

export type TransitionError =
  | "transicion_invalida"
  | "rol_no_permitido"
  | "nota_requerida"
  | "taller_requerido"
  | "no_llego"
  | "sigue_en_taller";

export const TRANSITION_ERROR_MESSAGES: Record<TransitionError, string> = {
  transicion_invalida: "La pieza no puede pasar a ese estado.",
  rol_no_permitido: "Tu rol no puede hacer este cambio de estado.",
  nota_requerida: "Escribe una nota para este cambio de estado.",
  taller_requerido: "Elige el taller al que se envía la pieza.",
  no_llego: "La pieza aún no llegó a la tienda.",
  sigue_en_taller: "La pieza sigue en el taller.",
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
    case "enviada_taller":
      return firstSentAt
        ? { lastSentAt: now }
        : { firstSentAt: now, lastSentAt: now };
    case "entregada":
      return { deliveredAt: now };
    case "rechazada":
    case "sin_arreglo":
    case "anulada":
      return { cancelledAt: now };
    default:
      return {};
  }
}

/** Valida y aplica una transición: el nuevo estado con sus fechas y el paso del historial. */
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

  const blocked = blockedBy(piece, t.to);
  if (blocked) return { ok: false, error: blocked };

  const workshopId = input.workshopId ?? piece.workshopId;
  if (t.requiresWorkshop && !workshopId)
    return { ok: false, error: "taller_requerido" };

  const changes: PieceChanges = {
    status: t.to,
    ...datesFor(t.to, input.now, piece.firstSentAt),
  };
  if (t.requiresWorkshop && input.workshopId)
    changes.workshopId = input.workshopId;

  return {
    ok: true,
    changes,
    steps: [{ from: t.from, to: t.to, event: "estado" }],
    note,
  };
}

/** Estados en los que se puede "Marcar llegada a tienda" (§7.1): antes del taller. */
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

/** Acción que no cambia el estado: valida el rol y la situación de la pieza. */
function action(
  piece: PieceSnapshot,
  allowed: boolean,
  roleOk: boolean,
  event: Exclude<PieceEvent, "estado">,
  changes: Omit<PieceChanges, "status">,
): TransitionResult {
  if (!roleOk) return { ok: false, error: "rol_no_permitido" };
  if (!allowed) return { ok: false, error: "transicion_invalida" };
  return {
    ok: true,
    changes: { status: piece.status, ...changes },
    steps: [{ from: piece.status, to: piece.status, event }],
    note: null,
  };
}

/** Registra la llegada física a la tienda: solo guarda la fecha (P47). */
export function markArrived(
  piece: PieceSnapshot,
  role: AppRole,
  now: Date,
): TransitionResult {
  return action(
    piece,
    !piece.arrivedAt && ARRIVAL_STATUSES.includes(piece.status),
    MARCAR_LLEGADA.includes(role),
    "llegada",
    { arrivedAt: now },
  );
}

/** "Recibir del taller": la pieza sigue en Interno, ya en la tienda (P47). */
export function canReceiveFromWorkshop(
  piece: Pick<PieceSnapshot, "status" | "readyForDelivery">,
  role: AppRole,
): boolean {
  return (
    piece.status === "enviada_taller" &&
    !piece.readyForDelivery &&
    TALLER.includes(role)
  );
}

export function receiveFromWorkshop(
  piece: PieceSnapshot,
  role: AppRole,
  now: Date,
): TransitionResult {
  return action(
    piece,
    piece.status === "enviada_taller" && !piece.readyForDelivery,
    TALLER.includes(role),
    "vuelta_taller",
    { lastReturnedAt: now },
  );
}

/** "Devolver al cliente": pieza rechazada o sin arreglo que sigue en la tienda (P47). */
export function canReturnToClient(
  piece: Pick<PieceSnapshot, "status" | "arrivedAt" | "returnedAt">,
  role: AppRole,
): boolean {
  return (
    (piece.status === "rechazada" || piece.status === "sin_arreglo") &&
    !!piece.arrivedAt &&
    !piece.returnedAt &&
    DEVOLVER.includes(role)
  );
}

export function returnToClient(
  piece: PieceSnapshot,
  role: AppRole,
  now: Date,
): TransitionResult {
  return action(
    piece,
    (piece.status === "rechazada" || piece.status === "sin_arreglo") &&
      !!piece.arrivedAt &&
      !piece.returnedAt,
    DEVOLVER.includes(role),
    "devolucion_cliente",
    { returnedAt: now },
  );
}
