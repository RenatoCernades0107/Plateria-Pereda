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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatCents, type Cents } from "@/domain/money";
import { refundPayment } from "@/server/payments/actions";

import {
  newDraft,
  PaymentFields,
  readDraft,
  type MethodOption,
} from "./payment-fields";

/** Pago que se puede reembolsar: su pedido de Shopify y lo que queda de él. */
export type RefundablePayment = {
  id: string;
  label: string;
  refundableCents: Cents;
};

/**
 * Corrección de pagos (§7.5): un pago no se edita; el admin registra un reembolso con
 * motivo, que queda en la auditoría y llega a Shopify si allá ya estaba cobrado. Con
 * un pedido por pago se elige qué pago se devuelve: se reembolsa en su pedido.
 */
export function RefundDialog({
  restorationId,
  paidCents,
  methods,
  refundablePayments = null,
}: {
  restorationId: string;
  paidCents: Cents;
  methods: MethodOption[];
  /** null: guía con la orden de piezas (el reembolso no dice de qué pago). */
  refundablePayments?: RefundablePayment[] | null;
}) {
  const [open, setOpen] = useState(false);
  const [paymentId, setPaymentId] = useState("");
  const [draft, setDraft] = useState(() => newDraft(null));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const target = refundablePayments?.find((p) => p.id === paymentId);
    if (refundablePayments && !target)
      return setError("Elige el pago que se reembolsa.");
    const read = readDraft(draft, null, { withBranch: false });
    if ("error" in read) return setError(read.error);
    const maxCents = target ? target.refundableCents : paidCents;
    if (read.totalCents > maxCents)
      return setError(
        target
          ? `El reembolso supera lo que queda de ese pago (${formatCents(maxCents)}).`
          : `El reembolso supera lo pagado (${formatCents(paidCents)}).`,
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
        ...(target && { paymentId: target.id }),
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
          setPaymentId("");
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
          {refundablePayments ? (
            <div className="space-y-1.5">
              <Label htmlFor="reembolso-pago">Pago que se devuelve</Label>
              <Select
                value={paymentId}
                onValueChange={(id) => {
                  setPaymentId(id);
                  const target = refundablePayments.find((p) => p.id === id);
                  // Por defecto, todo lo que queda de ese pago.
                  if (target)
                    setDraft((d) => ({
                      ...d,
                      rows: [
                        {
                          ...d.rows[0]!,
                          amount: (target.refundableCents / 100).toFixed(2),
                        },
                      ],
                    }));
                }}
              >
                <SelectTrigger id="reembolso-pago" className="w-full">
                  <SelectValue placeholder="Elige el pago" />
                </SelectTrigger>
                <SelectContent>
                  {refundablePayments.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.label} · quedan {formatCents(p.refundableCents)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
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
