"use client";

import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
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
  RESTORATION_KIND_LABELS,
  type RestorationKind,
} from "@/domain/restoration-status";
import { setRestorationKind } from "@/server/restorations/status-actions";

/**
 * Tipo de guía (punto 8): normal (se cobra), interna (piezas de la tienda) u
 * observada (reclamo). Lo marcan admin y ventas, siempre con confirmación.
 */

export const RESTORATION_KIND_OPTIONS: readonly RestorationKind[] = [
  "normal",
  "interno",
  "observado",
];

/** Descripción corta junto a la casilla del registro. */
export const KIND_SHORT_DESCRIPTIONS: Record<RestorationKind, string> = {
  normal: "Se cotiza, se cobra y crea su orden en Shopify.",
  interno:
    "Piezas de la tienda que se mandan a arreglar: no se cobran ni van a Shopify.",
  observado:
    "Piezas que vuelven por un reclamo: no se cobran ni llevan costo de servicio.",
};

/** Consecuencias que se confirman al marcar o cambiar el tipo. */
export const KIND_CONSEQUENCES: Record<RestorationKind, readonly string[]> = {
  normal: [
    "Las piezas siguen el flujo normal: se cotizan, se cobran y la guía crea su orden en Shopify cuando se aprueban.",
    "Las piezas quedan en el estado en que están; el administrador asigna los precios.",
  ],
  interno: [
    "Las piezas quedan Aprobadas sin precio de venta (no pasan por Consulta).",
    "La guía no va a Shopify y no se registran pagos ni adelanto.",
    "El costo de servicio del taller se puede anotar (opcional).",
  ],
  observado: [
    "Las piezas quedan en Observación, sin precio de venta ni costo de servicio.",
    "La guía no va a Shopify y no se registran pagos ni adelanto.",
  ],
};

function Consequences({ kind }: { kind: RestorationKind }) {
  return (
    <ul
      className="list-disc space-y-1 pl-5 text-sm"
      data-testid="consecuencias-tipo"
    >
      {KIND_CONSEQUENCES[kind].map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}

/** Badge del tipo junto al estado; la guía normal no lleva. */
export function RestorationKindBadge({ kind }: { kind: RestorationKind }) {
  if (kind === "normal") return null;
  return (
    <Badge variant="secondary" data-testid="tipo-guia">
      {RESTORATION_KIND_LABELS[kind]}
    </Badge>
  );
}

/**
 * Confirmación al marcar "Guía interna" u "Guía observada" en el registro: explica
 * las consecuencias antes de aplicarlo.
 */
export function RestorationKindConfirmDialog({
  kind,
  onConfirm,
  onCancel,
}: {
  /** Tipo por confirmar; null = cerrado. */
  kind: RestorationKind | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={kind !== null} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        {kind ? (
          <>
            <DialogHeader>
              <DialogTitle>
                ¿Registrar como guía{" "}
                {RESTORATION_KIND_LABELS[kind].toLowerCase()}?
              </DialogTitle>
              <DialogDescription>
                {KIND_SHORT_DESCRIPTIONS[kind]}
              </DialogDescription>
            </DialogHeader>
            <Consequences kind={kind} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancelar
              </Button>
              <Button type="button" onClick={onConfirm}>
                Sí, guía {RESTORATION_KIND_LABELS[kind].toLowerCase()}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/**
 * "Cambiar tipo de guía" en el detalle (admin y ventas): elige Normal, Interna u
 * Observada y confirma las consecuencias. La BD decide si se puede (sin orden de
 * Shopify, sin pagos y sin piezas que hayan ido al taller o se hayan entregado) y
 * su mensaje se muestra tal cual.
 */
export function ChangeRestorationKindButton({
  restorationId,
  kind,
}: {
  restorationId: string;
  kind: RestorationKind;
}) {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<RestorationKind>(kind);
  const [understood, setUnderstood] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const reset = (next: boolean) => {
    setOpen(next);
    setChoice(kind);
    setUnderstood(false);
    setError(null);
  };

  function confirm() {
    if (choice === kind || !understood) return;
    setError(null);
    startTransition(async () => {
      const result = await setRestorationKind(restorationId, choice);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      toast.success(
        `La guía ahora es ${RESTORATION_KIND_LABELS[choice].toLowerCase()}.`,
      );
      reset(false);
    });
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={() => reset(true)}>
        Cambiar tipo de guía
      </Button>
      <Dialog open={open} onOpenChange={reset}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cambiar tipo de guía</DialogTitle>
            <DialogDescription>
              Solo se puede cambiar si la guía no tiene orden de Shopify ni
              pagos, y ninguna pieza fue al taller ni se entregó.
            </DialogDescription>
          </DialogHeader>
          <fieldset className="space-y-2">
            <legend className="sr-only">Tipo de guía</legend>
            {RESTORATION_KIND_OPTIONS.map((k) => (
              <label
                key={k}
                className="flex items-start gap-3 rounded-lg border p-3"
              >
                <input
                  type="radio"
                  name="tipo-guia"
                  className="accent-primary mt-0.5 size-4"
                  value={k}
                  checked={choice === k}
                  onChange={() => {
                    setChoice(k);
                    setUnderstood(false);
                  }}
                />
                <span className="space-y-0.5">
                  <span className="block text-sm font-medium">
                    {RESTORATION_KIND_LABELS[k]}
                    {k === kind ? " (actual)" : ""}
                  </span>
                  <span className="text-muted-foreground block text-sm">
                    {KIND_SHORT_DESCRIPTIONS[k]}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
          {choice !== kind ? (
            <div className="space-y-3 rounded-lg border p-3">
              <p className="text-sm font-medium">
                Al cambiar a {RESTORATION_KIND_LABELS[choice]}:
              </p>
              <Consequences kind={choice} />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="accent-primary size-4"
                  checked={understood}
                  onChange={(e) => setUnderstood(e.target.checked)}
                />
                Entiendo las consecuencias
              </label>
            </div>
          ) : null}
          {error ? (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => reset(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={confirm}
              disabled={pending || choice === kind || !understood}
            >
              {pending ? <Loader2 className="animate-spin" /> : null}
              Cambiar tipo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
