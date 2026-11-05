"use client";

import {
  Ban,
  Check,
  Copy,
  Loader2,
  Receipt,
  RotateCcw,
  Undo2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { nextQuoteStatuses, type QuoteStatus } from "@/domain/quote";
import { changeQuoteStatus, duplicateQuote } from "@/server/quotes/actions";

import { QuoteDeliveryDialog } from "./quote-delivery-dialog";

const STATUS_ACTIONS = {
  aceptada: {
    label: "Marcar aceptada",
    done: "Cotización aceptada.",
    Icon: Check,
  },
  facturada: {
    label: "Marcar facturada",
    done: "Cotización facturada.",
    Icon: Receipt,
  },
  reembolsada: {
    label: "Marcar reembolsada",
    done: "Cotización reembolsada.",
    Icon: Undo2,
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
  anulada: {
    label: "Anular",
    done: "Cotización anulada.",
    Icon: Ban,
  },
} as const;

/**
 * Acciones de una cotización guardada: cambiar el estado (una emitida se acepta o
 * rechaza; una aceptada o rechazada vuelve a emitida; si se emitió por error se anula,
 * con confirmación porque es definitivo) y duplicarla como borrador.
 * El borrador se emite desde el formulario (se guarda antes). Aceptarla (el cliente la
 * aprobó) pide las fechas de entrega al cliente y del proveedor.
 */
export function QuoteActions({
  id,
  status,
  deliveryDays,
}: {
  id: string;
  status: QuoteStatus;
  /** Tiempo de entrega de la cotización: sugiere la fecha de entrega al aceptarla. */
  deliveryDays: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [accepting, setAccepting] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [refunding, setRefunding] = useState(false);
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
      setVoiding(false);
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
            onClick={() =>
              to === "aceptada"
                ? setAccepting(true)
                : to === "anulada"
                  ? setVoiding(true)
                  : to === "reembolsada"
                    ? setRefunding(true)
                    : change(to)
            }
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
      <Dialog
        open={voiding}
        onOpenChange={(value) => {
          if (!pending) setVoiding(value);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Anular cotización</DialogTitle>
            <DialogDescription>
              Úsalo si la cotización se emitió por error. No se puede deshacer:
              para corregirla, duplícala.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => setVoiding(false)}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => change("anulada")}
            >
              {pending ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <Ban aria-hidden />
              )}
              Anular cotización
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={refunding}
        onOpenChange={(value) => {
          if (!pending) setRefunding(value);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Marcar cotización como reembolsada</DialogTitle>
            <DialogDescription>
              Es el último estado: no se puede deshacer. Para volver a cotizar,
              duplícala.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => setRefunding(false)}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => {
                setRefunding(false);
                change("reembolsada");
              }}
            >
              {pending ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <Undo2 aria-hidden />
              )}
              Marcar reembolsada
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <QuoteDeliveryDialog
        key={accepting ? "abierto" : "cerrado"}
        open={accepting}
        onOpenChange={setAccepting}
        quoteId={id}
        mode="aceptar"
        deliveryDays={deliveryDays}
        deliveryDate={null}
        supplierDeliveryDate={null}
      />
    </div>
  );
}
