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
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatCents } from "@/domain/money";
import type { SuggestedPayment } from "@/domain/payments";
import {
  approveWithPayment,
  deliverWithBalance,
} from "@/server/payments/actions";

import {
  newDraft,
  PaymentFields,
  readDraft,
  type MethodOption,
} from "./payment-fields";

export type ApprovalPayment = {
  methods: MethodOption[];
  suggested: SuggestedPayment;
};

/**
 * Aprobar la última pieza con el paso opcional "Registrar adelanto" (Paso 11.2, P43):
 * la orden de Shopify se crea con el pago incluido.
 */
export function ApproveWithPaymentDialog({
  open,
  onOpenChange,
  restorationId,
  pieceCode,
  pieceId,
  payment,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  restorationId: string;
  pieceCode: string;
  pieceId: string;
  payment: ApprovalPayment;
  onDone: () => void;
}) {
  const [draft, setDraft] = useState(() => newDraft(payment.suggested.amount));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const approve = (withPayment: boolean) => {
    const read = withPayment ? readDraft(draft, null) : null;
    if (read && "error" in read) return setError(read.error);
    setError(null);
    startTransition(async () => {
      const result = await approveWithPayment(
        restorationId,
        [pieceId],
        read ? read.input : null,
      );
      if ("error" in result) return setError(result.error);
      toast.success(
        read
          ? `${pieceCode}: Aprobada. Pago de ${formatCents(read.totalCents)} registrado.`
          : `${pieceCode}: Aprobada.`,
      );
      onOpenChange(false);
      onDone();
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Aprobar {pieceCode}</DialogTitle>
          <DialogDescription>
            Es la última pieza por aprobar: se crea la orden de Shopify.
            Registra el{" "}
            {payment.suggested.kind === "adelanto" ? "adelanto" : "pago"} (
            {formatCents(payment.suggested.amount)}) para que la orden lo
            incluya.
          </DialogDescription>
        </DialogHeader>
        {error ? <FormAlert>{error}</FormAlert> : null}
        <PaymentFields
          draft={draft}
          onChange={setDraft}
          methods={payment.methods}
          idPrefix="adelanto"
        />
        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => approve(false)}
          >
            Aprobar sin pago
          </Button>
          <Button
            type="button"
            disabled={pending}
            onClick={() => approve(true)}
          >
            {pending ? "Guardando…" : "Aprobar y registrar pago"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Entregar con saldo pendiente (P45): ventas y admin lo confirman con una nota. */
export function DeliverWithBalanceDialog({
  open,
  onOpenChange,
  restorationId,
  pieceIds,
  subject,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  restorationId: string | null;
  pieceIds: string[];
  subject: string;
  onDone: () => void;
}) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const confirm = () =>
    startTransition(async () => {
      const result = await deliverWithBalance(
        restorationId,
        pieceIds,
        note.trim() || null,
      );
      if ("error" in result) return setError(result.error);
      toast.success(`${subject}: Entregada con saldo pendiente.`);
      onOpenChange(false);
      onDone();
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Falta cobrar el saldo</DialogTitle>
          <DialogDescription>
            La restauración tiene saldo pendiente. ¿Entregar {subject} igual?
            Quedará anotado en el historial.
          </DialogDescription>
        </DialogHeader>
        {error ? <FormAlert>{error}</FormAlert> : null}
        <div className="space-y-1.5">
          <Label htmlFor="entrega-saldo-nota">Nota (opcional)</Label>
          <Textarea
            id="entrega-saldo-nota"
            rows={2}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button type="button" disabled={pending} onClick={confirm}>
            {pending ? "Guardando…" : "Entregar igual"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
