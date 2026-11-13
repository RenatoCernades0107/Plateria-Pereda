"use client";

import { Banknote } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { FormAlert } from "@/components/auth/form-alert";
import {
  newDraft,
  PaymentFields,
  readDraft,
  type MethodOption,
} from "@/components/payments/payment-fields";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCents, type Cents } from "@/domain/money";
import {
  MAX_INVOICE_NUMBER_LENGTH,
  parseInvoiceNumber,
} from "@/domain/quote-payments";
import { registerQuotePayment } from "@/server/quotes/payment-actions";

/**
 * «Registrar pago» de una cotización aceptada o facturada (admin y ventas): método,
 * monto (hasta el saldo), fecha y, si ya se emitió, el N.º de factura. Sin Shopify.
 */
export function RegisterQuotePaymentDialog({
  quoteId,
  balanceCents,
  methods,
}: {
  quoteId: string;
  balanceCents: Cents;
  methods: MethodOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => newDraft(balanceCents));
  const [invoice, setInvoice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const read = readDraft(draft, balanceCents, { withBranch: false });
    if ("error" in read) return setError(read.error);
    const parsedInvoice = parseInvoiceNumber(invoice);
    if ("error" in parsedInvoice) return setError(parsedInvoice.error);
    setError(null);
    startTransition(async () => {
      const result = await registerQuotePayment(quoteId, {
        paidOn: read.input.paidOn,
        rows: read.input.rows,
        invoiceNumber: invoice,
      });
      if ("error" in result) return setError(result.error);
      toast.success(`Pago de ${formatCents(read.totalCents)} registrado.`);
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setDraft(newDraft(balanceCents));
          setInvoice("");
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button disabled={balanceCents <= 0}>
          <Banknote aria-hidden />
          Registrar pago
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>Registrar pago</DialogTitle>
            <DialogDescription>
              Saldo: {formatCents(balanceCents)}. El pago queda solo en el
              sistema (no crea pedido en Shopify).
            </DialogDescription>
          </DialogHeader>
          {error ? <FormAlert>{error}</FormAlert> : null}
          <PaymentFields
            draft={draft}
            onChange={setDraft}
            methods={methods}
            idPrefix="pago-cotizacion"
          />
          <div className="space-y-1.5">
            <Label htmlFor="pago-cotizacion-factura">
              N.º de factura (opcional)
            </Label>
            <Input
              id="pago-cotizacion-factura"
              value={invoice}
              maxLength={MAX_INVOICE_NUMBER_LENGTH}
              placeholder="F001-00000123"
              onChange={(e) => setInvoice(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : "Guardar pago"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
