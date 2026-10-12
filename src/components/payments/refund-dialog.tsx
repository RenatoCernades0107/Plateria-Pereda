"use client";

import { Undo2 } from "lucide-react";
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
import { formatCents, type Cents } from "@/domain/money";
import { refundPayment } from "@/server/payments/actions";

import {
  newDraft,
  PaymentFields,
  readDraft,
  type MethodOption,
} from "./payment-fields";

/**
 * Corrección de pagos (§7.5): un pago no se edita; el admin registra un reembolso con
 * motivo, que queda en la auditoría y llega a Shopify si allá ya estaba cobrado.
 */
export function RefundDialog({
  restorationId,
  paidCents,
  methods,
}: {
  restorationId: string;
  paidCents: Cents;
  methods: MethodOption[];
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => newDraft(null));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const read = readDraft(draft, null);
    if ("error" in read) return setError(read.error);
    if (read.totalCents > paidCents)
      return setError(
        `El reembolso supera lo pagado (${formatCents(paidCents)}).`,
      );
    if (!reason.trim()) return setError("Escribe el motivo del reembolso.");
    const row = read.input.rows[0]!;
    setError(null);
    startTransition(async () => {
      const result = await refundPayment(restorationId, {
        methodId: row.methodId,
        amountCents: row.amountCents,
        paidOn: read.input.paidOn,
        reason,
      });
      if ("error" in result) return setError(result.error);
      toast.success(`Reembolso de ${formatCents(row.amountCents)} registrado.`);
      setOpen(false);
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setDraft(newDraft(null));
          setReason("");
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" disabled={paidCents <= 0}>
          <Undo2 />
          Reembolsar
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Reembolsar</DialogTitle>
            <DialogDescription>
              Pagado: {formatCents(paidCents)}. Para corregir un pago, devuelve
              el monto con su motivo.
            </DialogDescription>
          </DialogHeader>
          {error ? <FormAlert>{error}</FormAlert> : null}
          <PaymentFields
            draft={draft}
            onChange={setDraft}
            single
            methods={methods}
            idPrefix="reembolso"
          />
          <div className="space-y-1.5">
            <Label htmlFor="reembolso-motivo">Motivo (obligatorio)</Label>
            <Textarea
              id="reembolso-motivo"
              rows={2}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? "Guardando…" : "Registrar reembolso"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
