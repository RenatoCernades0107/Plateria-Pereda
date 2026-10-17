"use client";

import {
  ChevronDown,
  type LucideIcon,
  PackageOpen,
  Store,
  Truck,
  Undo2,
  Wrench,
  X,
} from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { can } from "@/domain/permissions";
import {
  availableTransitions,
  canMarkArrived,
  canReceiveFromWorkshop,
  canReturnToClient,
  canSendToWorkshop,
  isClosedStatus,
  PIECE_STATUS_LABELS,
  type PieceStatus,
  type PieceTransition,
} from "@/domain/piece-state-machine";
import type { PieceLocation } from "@/domain/restoration-status";
import type { AppRole } from "@/lib/roles";
import {
  assignWorkshop,
  changePieceStatus,
  markPiecesArrived,
  receiveFromWorkshop,
  returnPiecesToClient,
  sendPiecesToWorkshop,
} from "@/server/restorations/status-actions";

import type { WorkshopOption } from "./piece-fields";
import {
  ACTION_LABELS,
  needsDialog,
  requirementsFor,
  ReviewDialog,
  snapshotOf,
  StatusChangeDialog,
  WORKSHOP_LABELS,
  type PendingChange,
  type StatusPiece,
} from "./piece-status-actions";

/** No se cambia el taller de una pieza entregada o en un estado final. */
export const WORKSHOP_LOCKED: readonly PieceStatus[] = [
  "entregada",
  "rechazada",
  "sin_arreglo",
  "anulada",
];

/** Tampoco el de una pieza que está en el taller (por trabajo o revisión). */
export const isWorkshopLocked = (piece: {
  status: PieceStatus;
  location?: PieceLocation;
}) => WORKSHOP_LOCKED.includes(piece.status) || piece.location === "en_taller";

/** Lo que las acciones masivas necesitan de cada pieza. */
type BulkPiece = Pick<
  StatusPiece,
  "status" | "arrivedAt" | "readyForDelivery" | "returnedAt"
> &
  Partial<StatusPiece>;

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
    canSendToWorkshop(s, role) ||
    canReceiveFromWorkshop(s, role) ||
    canReturnToClient(s, role) ||
    (can(role, "piezas.asignar-taller") &&
      !isWorkshopLocked({ status: piece.status, location: piece.location }))
  );
}

const NO_WORKSHOP = "ninguno";

/**
 * Botón de una acción masiva. Si solo algunas de las piezas elegidas la admiten, se
 * ve deshabilitado y el `title` explica por qué (en vez de desaparecer); si ninguna
 * la admite, no se muestra.
 */
function BulkButton({
  label,
  icon: Icon,
  able,
  chosen,
  verb,
  primary = false,
  pending,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  /** Cuántas de las piezas elegidas admiten la acción. */
  able: number;
  chosen: number;
  /** "enviar al taller", "recibir del taller"… para el motivo. */
  verb: string;
  primary?: boolean;
  pending: boolean;
  onClick: () => void;
}) {
  if (able === 0) return null;
  const reason =
    able < chosen
      ? `Solo ${able} de las ${chosen} piezas elegidas se pueden ${verb}; desmarca las demás.`
      : undefined;
  return (
    <span title={reason} className="inline-flex" data-reason={reason}>
      <Button
        size="sm"
        variant={primary ? "default" : "outline"}
        disabled={pending || reason !== undefined}
        onClick={onClick}
      >
        <Icon aria-hidden />
        {label}
      </Button>
    </span>
  );
}

/**
 * Acciones para las piezas elegidas, en una barra fija arriba mientras se recorre la
 * lista: el contador y "Quitar selección"; las acciones de ubicación con su ícono
 * (Enviar al taller es la principal cuando corresponde); "Cambiar estado" con un menú
 * de los cambios comunes a todas, y "Asignar taller" con un menú de talleres. En el
 * celular los grupos se apilan. `restorationId` null = piezas de varias
 * restauraciones (vista de piezas).
 */
export function PiecesBulkBar({
  restorationId,
  chosen,
  role,
  workshops,
  onDone,
  onClear = onDone,
  alwaysVisible = false,
  total,
  workshopPicker = true,
  children,
}: {
  restorationId: string | null;
  chosen: StatusPiece[];
  role: AppRole;
  workshops: WorkshopOption[];
  /** Tras aplicar una acción (normalmente, vaciar la selección). */
  onDone: () => void;
  /** "Quitar selección" (por defecto, `onDone`). */
  onClear?: () => void;
  /** Barra visible aun sin piezas elegidas (detalle de la guía). */
  alwaysVisible?: boolean;
  /** Piezas que se pueden elegir, para el contador "N de M". */
  total?: number;
  /**
   * Menú "Asignar taller" en la barra. La tabla de piezas lo apaga: allí el taller se
   * asigna con el lápiz de cada pieza sin taller.
   */
  workshopPicker?: boolean;
  /** Acciones extra de la vista (p. ej. exportar las piezas elegidas). */
  children?: React.ReactNode;
}) {
  const [dialog, setDialog] = useState<PendingChange | null>(null);
  const [sending, setSending] = useState(false);
  const [pending, startTransition] = useTransition();
  // Lo elegido en un menú corre al cerrarse, así el diálogo que abra recibe el foco.
  const chosenAction = useRef<(() => void) | null>(null);

  const bulk = commonTransitions(chosen, role);
  const howMany = (check: (piece: ReturnType<typeof snapshot>) => boolean) =>
    chosen.filter((p) => check(snapshot(p))).length;
  const arrival = howMany((p) => canMarkArrived(p, role));
  const send = howMany((p) => canSendToWorkshop(p, role));
  const receive = howMany((p) => canReceiveFromWorkshop(p, role));
  const giveBack = howMany((p) => canReturnToClient(p, role));
  const assignable =
    workshopPicker && can(role, "piezas.asignar-taller")
      ? chosen.filter((p) => !isWorkshopLocked(p)).length
      : 0;
  const ids = chosen.map((p) => p.id);
  const n = chosen.length;

  const count = n === 1 ? "1 pieza" : `${n} piezas`;
  const done = (message: string) => {
    toast.success(message);
    onDone();
  };
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

  const sendToWorkshop = async (workshopId: string) => {
    const result = await sendPiecesToWorkshop(ids, workshopId);
    if ("error" in result) return result.error;
    done(`${count}: enviada${n === 1 ? "" : "s"} al taller.`);
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

  const assign = (workshopId: string | null) =>
    startTransition(async () => {
      const result = await assignWorkshop(restorationId, ids, workshopId);
      if ("error" in result) toast.error(result.error);
      else done("Taller asignado.");
    });

  if (n === 0 && !alwaysVisible) return null;

  const statusReason =
    n === 0
      ? "Elige piezas para cambiar su estado."
      : bulk.length === 0
        ? "Las piezas elegidas no comparten un cambio de estado posible; desmarca las que no correspondan."
        : undefined;
  const assignReason =
    assignable > 0 && assignable < n
      ? "Algunas piezas elegidas están en el taller, entregadas o cerradas: su taller no se cambia."
      : undefined;
  const regular = bulk.filter((c) => !isClosedStatus(c.to));
  const closing = bulk.filter((c) => isClosedStatus(c.to));
  const runAfterClose = () => {
    const action = chosenAction.current;
    chosenAction.current = null;
    action?.();
  };

  return (
    <div
      className="bg-card border-primary/40 sticky top-2 z-20 flex flex-col gap-2 rounded-lg border px-3 py-2 shadow-sm md:flex-row md:flex-wrap md:items-center"
      role="region"
      aria-label="Acciones para las piezas elegidas"
    >
      <div className="flex items-center justify-between gap-2 md:mr-auto">
        <p className="text-sm font-medium whitespace-nowrap" aria-live="polite">
          {total !== undefined
            ? `${n} de ${total} ${total === 1 ? "seleccionada" : "seleccionadas"}`
            : n === 1
              ? "1 pieza seleccionada"
              : `${n} piezas seleccionadas`}
        </p>
        {n > 0 ? (
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground"
            onClick={onClear}
          >
            <X aria-hidden />
            Quitar selección
          </Button>
        ) : null}
      </div>
      <div
        className="flex flex-wrap items-center gap-1.5"
        role="group"
        aria-label="Acciones"
      >
        <BulkButton
          label={WORKSHOP_LABELS.send}
          icon={Truck}
          able={send}
          chosen={n}
          verb="enviar al taller"
          primary
          pending={pending}
          onClick={() => setSending(true)}
        />
        <BulkButton
          label="Marcar llegada"
          icon={Store}
          able={arrival}
          chosen={n}
          verb="marcar como llegadas"
          pending={pending}
          onClick={() =>
            act(
              () => markPiecesArrived(restorationId, ids),
              "llegada a la tienda.",
            )
          }
        />
        <BulkButton
          label={WORKSHOP_LABELS.back}
          icon={PackageOpen}
          able={receive}
          chosen={n}
          verb="recibir del taller"
          pending={pending}
          onClick={() =>
            act(
              () => receiveFromWorkshop(restorationId, ids),
              "de vuelta del taller.",
            )
          }
        />
        <BulkButton
          label="Devolver al cliente"
          icon={Undo2}
          able={giveBack}
          chosen={n}
          verb="devolver al cliente"
          pending={pending}
          onClick={() =>
            act(
              () => returnPiecesToClient(restorationId, ids),
              "devuelta al cliente.",
            )
          }
        />
        <span
          title={statusReason}
          className="inline-flex"
          data-reason={statusReason}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                disabled={pending || statusReason !== undefined}
                aria-label={
                  n > 0 ? `Cambiar estado de ${count}` : "Cambiar estado"
                }
              >
                Cambiar estado
                <ChevronDown aria-hidden className="text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="min-w-48"
              onCloseAutoFocus={runAfterClose}
            >
              {regular.length > 0 ? (
                <DropdownMenuLabel className="text-muted-foreground text-xs">
                  Pasar a…
                </DropdownMenuLabel>
              ) : null}
              {regular.map((change) => (
                <DropdownMenuItem
                  key={change.to}
                  onSelect={() => {
                    chosenAction.current = () => runChange(change);
                  }}
                >
                  {ACTION_LABELS[change.to]}
                </DropdownMenuItem>
              ))}
              {closing.length > 0 ? (
                <>
                  {regular.length > 0 ? <DropdownMenuSeparator /> : null}
                  <DropdownMenuLabel className="text-muted-foreground text-xs">
                    Cerrar las piezas
                  </DropdownMenuLabel>
                  {closing.map((change) => (
                    <DropdownMenuItem
                      key={change.to}
                      variant="destructive"
                      onSelect={() => {
                        chosenAction.current = () => runChange(change);
                      }}
                    >
                      {ACTION_LABELS[change.to]}
                    </DropdownMenuItem>
                  ))}
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
        {assignable > 0 ? (
          <span
            title={assignReason}
            className="inline-flex"
            data-reason={assignReason}
          >
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending || assignReason !== undefined}
                >
                  <Wrench aria-hidden />
                  Asignar taller
                  <ChevronDown aria-hidden className="text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-48">
                <DropdownMenuLabel className="text-muted-foreground text-xs">
                  Taller de {count}
                </DropdownMenuLabel>
                {workshops.map((w) => (
                  <DropdownMenuItem key={w.id} onSelect={() => assign(w.id)}>
                    {w.name}
                  </DropdownMenuItem>
                ))}
                {workshops.length > 0 ? <DropdownMenuSeparator /> : null}
                <DropdownMenuItem
                  key={NO_WORKSHOP}
                  className="text-muted-foreground"
                  onSelect={() => assign(null)}
                >
                  Sin taller
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </span>
        ) : null}
        {children}
      </div>
      <StatusChangeDialog
        key={dialog?.to ?? "cerrado"}
        open={dialog !== null}
        onOpenChange={(open) => !open && setDialog(null)}
        change={dialog}
        pieces={chosen}
        workshops={workshops}
        onConfirm={(input) => applyBulk(dialog!, input)}
      />
      <ReviewDialog
        key={sending ? "envio-masivo-abierto" : "envio-masivo-cerrado"}
        kind="envio"
        open={sending}
        onOpenChange={setSending}
        pieces={chosen}
        workshops={workshops}
        onConfirm={sendToWorkshop}
      />
    </div>
  );
}
