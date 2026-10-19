"use client";

import { Loader2, Zap } from "lucide-react";
import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
 * Botón que marca o quita "Urgente" (el rayo amarillo de `UrgentIcon`): relleno y en
 * ámbar cuando la pieza es urgente. El cambio se ve al instante y vuelve atrás si la
 * BD lo rechaza. `variant="icon"`: solo el rayo (tablas); `"label"`: con el texto
 * "Urgente" (detalle de la pieza).
 */
export function UrgentToggle({
  piece,
  variant = "icon",
  className,
}: {
  piece: { id: string; code: string; urgent: boolean };
  variant?: "icon" | "label";
  className?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [urgent, setOptimistic] = useOptimistic(piece.urgent);
  const label = urgent ? URGENT_LABELS.off : URGENT_LABELS.on;

  const toggle = () =>
    startTransition(async () => {
      const next = !urgent;
      setOptimistic(next);
      const result = await setPiecesUrgent([piece.id], next);
      if ("error" in result) toast.error(result.error);
      else
        toast.success(
          next
            ? `${piece.code} marcada como urgente.`
            : `${piece.code} ya no es urgente.`,
        );
    });

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
  );
}
