"use client";

import { CalendarDays, Loader2, Zap } from "lucide-react";
import { useId, useOptimistic, useState, useTransition } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DELIVERY_DATE_INVALID,
  DELIVERY_DATE_REQUIRED,
  formatDeliveryDate,
  isDeliveryOverdue,
  isIsoDate,
  todayInLima,
  WORKSHOP_DATE_AFTER_CLIENT,
} from "@/domain/delivery-date";
import { can } from "@/domain/permissions";
import { isClosedStatus, type PieceStatus } from "@/domain/piece-state-machine";
import type { AppRole } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { setPiecesUrgent } from "@/server/restorations/status-actions";

/**
 * Si el rol puede marcar o quitar "Urgente" a la pieza: admin, ventas y logística, en
 * piezas que no están cerradas ni entregadas (la BD no deja cambiarlas).
 */
export function canToggleUrgent(
  piece: { status: PieceStatus },
  role: AppRole,
): boolean {
  return (
    can(role, "piezas.marcar-urgente") &&
    piece.status !== "entregada" &&
    !isClosedStatus(piece.status)
  );
}

export const URGENT_LABELS = {
  on: "Marcar como urgente",
  off: "Quitar urgente",
} as const;

/**
 * Diálogo que pide la fecha estimada de entrega de piezas urgentes y las marca (o, si ya
 * lo eran, coloca o cambia su fecha). Una pieza urgente siempre lleva fecha, por eso no
 * se marca sin ella. `subject`: "PZ-0001" o "3 piezas".
 */
export function UrgentDateDialog({
  open,
  onOpenChange,
  pieceIds,
  subject,
  initialDate,
  initialWorkshopDate,
  keepWorkshopDate = false,
  workshopDateEditable = false,
  alreadyUrgent = false,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pieceIds: string[];
  subject: string;
  /** Fecha de entrega al cliente con la que abre (la actual, si ya tiene). */
  initialDate?: string | null;
  /** Fecha de entrega del taller con la que abre (la actual, si ya tiene). */
  initialWorkshopDate?: string | null;
  /** Varias piezas: con la fecha del taller en blanco, cada una conserva la suya. */
  keepWorkshopDate?: boolean;
  /** Quien mira cambia la fecha del taller (logística y admin); ventas no. */
  workshopDateEditable?: boolean;
  /** Las piezas ya son urgentes: solo se coloca o cambia la fecha. */
  alreadyUrgent?: boolean;
  /** Tras guardar (p. ej. vaciar la selección). */
  onDone?: () => void;
}) {
  const [date, setDate] = useState(initialDate ?? "");
  const [workshopDate, setWorkshopDate] = useState(initialWorkshopDate ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputId = useId();
  const workshopInputId = useId();

  const save = () => {
    if (date === "") return setError(`${DELIVERY_DATE_REQUIRED}.`);
    if (!isIsoDate(date)) return setError(`${DELIVERY_DATE_INVALID}.`);
    if (workshopDateEditable && workshopDate !== "") {
      if (!isIsoDate(workshopDate))
        return setError(`${DELIVERY_DATE_INVALID}.`);
      if (workshopDate > date)
        return setError(`${WORKSHOP_DATE_AFTER_CLIENT}.`);
    }
    setError(null);
    startTransition(async () => {
      // Sin permiso de la fecha del taller, cada pieza conserva la suya (o recibe la
      // de por defecto, 3 días antes de la del cliente).
      const result = await setPiecesUrgent(pieceIds, true, date, {
        workshopDeliveryDate: workshopDateEditable
          ? workshopDate || null
          : null,
        keepWorkshopDate: workshopDateEditable ? keepWorkshopDate : true,
      });
      if ("error" in result) return setError(result.error);
      toast.success(
        alreadyUrgent
          ? `Entrega de ${subject} para el ${formatDeliveryDate(date)}.`
          : `${subject} marcada como urgente para el ${formatDeliveryDate(date)}.`,
      );
      onOpenChange(false);
      onDone?.();
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {alreadyUrgent ? "Fechas de entrega" : "Marcar como urgente"}
          </DialogTitle>
          <DialogDescription>
            Toda pieza urgente lleva fecha estimada de entrega al cliente; la
            del taller queda 3 días antes si no la indicas ({subject}).
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          {error ? <FormAlert>{error}</FormAlert> : null}
          <div className="space-y-2">
            <Label htmlFor={inputId}>
              Fecha estimada de entrega al cliente
            </Label>
            <Input
              id={inputId}
              type="date"
              min={todayInLima()}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={pending}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={workshopInputId}>
              Fecha estimada de entrega del taller
            </Label>
            <Input
              id={workshopInputId}
              type="date"
              min={todayInLima()}
              max={date || undefined}
              value={
                workshopDateEditable
                  ? workshopDate
                  : (initialWorkshopDate ?? "")
              }
              onChange={(e) => setWorkshopDate(e.target.value)}
              disabled={pending || !workshopDateEditable}
            />
            <p className="text-muted-foreground text-xs">
              {!workshopDateEditable
                ? "La cambian logística y administración. Por defecto, 3 días antes de la del cliente."
                : keepWorkshopDate
                  ? "En blanco: cada pieza conserva la fecha del taller que tenga (o 3 días antes de la del cliente)."
                  : "En blanco: 3 días antes de la fecha del cliente."}
            </p>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending
                ? "Guardando…"
                : alreadyUrgent
                  ? "Guardar fecha"
                  : "Marcar urgente"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Fecha estimada de entrega de una pieza urgente: "Entrega 30 oct", en rojo si ya pasó,
 * o "Sin fecha de entrega" en ámbar si no la tiene (las marcadas antes de pedirla). Con
 * `editable` es un botón que abre `UrgentDateDialog` para colocarla o cambiarla.
 */
export function DeliveryDate({
  piece,
  editable = false,
  workshopDateEditable = false,
  className,
}: {
  piece: {
    id: string;
    code: string;
    estimatedDeliveryDate?: string | null;
    workshopDeliveryDate?: string | null;
  };
  editable?: boolean;
  /** Quien mira cambia la fecha del taller (logística y admin). */
  workshopDateEditable?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const date = piece.estimatedDeliveryDate ?? null;
  const overdue = date !== null && isDeliveryOverdue(date);
  const workshopDate = piece.workshopDeliveryDate ?? null;
  const text = date
    ? `Entrega ${formatDeliveryDate(date)}${
        workshopDate ? ` · Taller ${formatDeliveryDate(workshopDate)}` : ""
      }`
    : "Sin fecha de entrega";
  const tone = !date
    ? "text-amber-700 dark:text-amber-300"
    : overdue
      ? "text-destructive"
      : "text-muted-foreground";
  const classes = cn("inline-flex items-center gap-1 text-xs", tone, className);

  if (!editable)
    return (
      <span
        className={classes}
        data-testid="fecha-entrega"
        data-overdue={overdue || undefined}
      >
        <CalendarDays aria-hidden className="size-3.5" />
        {text}
        {overdue ? " (vencida)" : null}
      </span>
    );
  return (
    <>
      <button
        type="button"
        className={cn(classes, "underline-offset-4 hover:underline")}
        data-testid="fecha-entrega"
        data-overdue={overdue || undefined}
        title={
          date ? "Cambiar la fecha de entrega" : "Colocar la fecha de entrega"
        }
        aria-label={`${date ? "Cambiar" : "Colocar"} la fecha de entrega de ${piece.code}`}
        onClick={() => setOpen(true)}
      >
        <CalendarDays aria-hidden className="size-3.5" />
        {date ? text : "Colocar fecha de entrega"}
        {overdue ? " (vencida)" : null}
      </button>
      <UrgentDateDialog
        key={open ? `abierto-${date ?? ""}` : "cerrado"}
        open={open}
        onOpenChange={setOpen}
        pieceIds={[piece.id]}
        subject={piece.code}
        initialDate={date}
        initialWorkshopDate={workshopDate}
        workshopDateEditable={workshopDateEditable}
        alreadyUrgent
      />
    </>
  );
}

/**
 * Botón que marca o quita "Urgente" (el rayo amarillo de `UrgentIcon`): relleno y en
 * ámbar cuando la pieza es urgente. Al marcar pide la fecha estimada de entrega (toda
 * pieza urgente la lleva); al quitar, el cambio se ve al instante y vuelve atrás si la
 * BD lo rechaza. `variant="icon"`: solo el rayo (tablas); `"label"`: con el texto
 * "Urgente" (detalle de la pieza).
 */
export function UrgentToggle({
  piece,
  variant = "icon",
  workshopDateEditable = false,
  className,
}: {
  piece: {
    id: string;
    code: string;
    urgent: boolean;
    estimatedDeliveryDate?: string | null;
    workshopDeliveryDate?: string | null;
  };
  variant?: "icon" | "label";
  /** Quien mira cambia la fecha del taller (logística y admin). */
  workshopDateEditable?: boolean;
  className?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [urgent, setOptimistic] = useOptimistic(piece.urgent);
  const [asking, setAsking] = useState(false);
  const label = urgent ? URGENT_LABELS.off : URGENT_LABELS.on;

  const unmark = () =>
    startTransition(async () => {
      setOptimistic(false);
      const result = await setPiecesUrgent([piece.id], false);
      if ("error" in result) toast.error(result.error);
      else toast.success(`${piece.code} ya no es urgente.`);
    });
  // Marcarla pide primero la fecha de entrega.
  const toggle = () => (urgent ? unmark() : setAsking(true));

  const icon = pending ? (
    <Loader2 aria-hidden className="animate-spin" />
  ) : (
    <Zap
      aria-hidden
      className={cn(
        urgent ? "fill-amber-400 text-amber-600" : "text-muted-foreground",
      )}
    />
  );

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size={variant === "icon" ? "icon" : "sm"}
        // Solo el rayo: el nombre dice la acción. Con texto: "Urgente", activado o no.
        aria-label={variant === "icon" ? label : undefined}
        aria-pressed={variant === "label" ? urgent : undefined}
        title={label}
        disabled={pending}
        onClick={toggle}
        data-urgent={urgent || undefined}
        className={cn(
          variant === "icon" && "size-8 shrink-0",
          urgent &&
            "border-amber-300 bg-amber-100 text-amber-950 hover:bg-amber-200 dark:border-amber-500/60 dark:bg-amber-500/20 dark:text-amber-100",
          className,
        )}
      >
        {icon}
        {variant === "label" ? "Urgente" : null}
      </Button>
      <UrgentDateDialog
        key={asking ? "abierto" : "cerrado"}
        open={asking}
        onOpenChange={setAsking}
        pieceIds={[piece.id]}
        subject={piece.code}
        initialDate={piece.estimatedDeliveryDate}
        initialWorkshopDate={piece.workshopDeliveryDate}
        workshopDateEditable={workshopDateEditable}
      />
    </>
  );
}
