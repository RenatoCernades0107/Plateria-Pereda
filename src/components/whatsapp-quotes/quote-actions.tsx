"use client";

import { useState, useTransition } from "react";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  discardWhatsappQuote,
  reopenWhatsappQuote,
} from "@/server/whatsapp-quotes/actions";

/** "Descartar" (con motivo) una cotización de WhatsApp (P46). */
export function DiscardQuoteButton({ quoteId }: { quoteId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    if (!reason.trim()) {
      setError("Escribe el motivo del descarte.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await discardWhatsappQuote(quoteId, reason);
      if ("error" in result) return setError(result.error);
      toast.success("Cotización descartada.");
      setOpen(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" className="text-destructive">
          Descartar
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Descartar la cotización</DialogTitle>
          <DialogDescription>
            Queda en el registro; se puede reabrir si el cliente vuelve.
          </DialogDescription>
        </DialogHeader>
        {error ? <FormAlert>{error}</FormAlert> : null}
        <div className="space-y-1.5">
          <Label htmlFor="motivo-descarte">Motivo (obligatorio)</Label>
          <Textarea
            id="motivo-descarte"
            rows={3}
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="destructive" onClick={submit} disabled={pending}>
            {pending ? "Guardando…" : "Confirmar: Descartar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** "Reabrir" una cotización descartada: vuelve a su estado calculado. */
export function ReopenQuoteButton({ quoteId }: { quoteId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await reopenWhatsappQuote(quoteId);
          if ("error" in result) toast.error(result.error);
          else toast.success("Cotización reabierta.");
        })
      }
    >
      Reabrir
    </Button>
  );
}
