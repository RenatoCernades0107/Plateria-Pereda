"use client";

import { Check, Copy, RotateCcw, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { nextQuoteStatuses, type QuoteStatus } from "@/domain/quote";
import { changeQuoteStatus, duplicateQuote } from "@/server/quotes/actions";

const STATUS_ACTIONS = {
  aceptada: {
    label: "Marcar aceptada",
    done: "Cotización aceptada.",
    Icon: Check,
  },
  rechazada: {
    label: "Marcar rechazada",
    done: "Cotización rechazada.",
    Icon: X,
  },
  emitida: {
    label: "Volver a emitida",
    done: "La cotización volvió a emitida.",
    Icon: RotateCcw,
  },
} as const;

/**
 * Acciones de una cotización guardada: cambiar el estado (una emitida se acepta o
 * rechaza; una aceptada o rechazada vuelve a emitida) y duplicarla como borrador.
 * El borrador se emite desde el formulario (se guarda antes).
 */
export function QuoteActions({
  id,
  status,
}: {
  id: string;
  status: QuoteStatus;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const targets =
    status === "borrador"
      ? []
      : nextQuoteStatuses(status).filter(
          (s): s is keyof typeof STATUS_ACTIONS => s in STATUS_ACTIONS,
        );

  const change = (to: keyof typeof STATUS_ACTIONS) =>
    startTransition(async () => {
      const result = await changeQuoteStatus(id, to);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(STATUS_ACTIONS[to].done);
      router.refresh();
    });

  const duplicate = () =>
    startTransition(async () => {
      const result = await duplicateQuote(id);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Se creó una copia en borrador.");
      router.push(`/cotizaciones/${result.id}`);
    });

  return (
    <div className="flex flex-wrap gap-2">
      {targets.map((to) => {
        const { label, Icon } = STATUS_ACTIONS[to];
        return (
          <Button
            key={to}
            type="button"
            variant={to === "aceptada" ? "default" : "outline"}
            disabled={pending}
            onClick={() => change(to)}
          >
            <Icon aria-hidden />
            {label}
          </Button>
        );
      })}
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        onClick={duplicate}
      >
        <Copy aria-hidden />
        Duplicar cotización
      </Button>
    </div>
  );
}
