"use client";

import { Banknote } from "lucide-react";
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
import { formatCents, type Cents } from "@/domain/money";
import type { SuggestedPayment } from "@/domain/payments";
import { registerPayment } from "@/server/payments/actions";

import {
  newDraft,
  PaymentFields,
  readDraft,
  type MethodOption,
} from "./payment-fields";

const SUGGESTION_LABELS: Record<SuggestedPayment["kind"], string> = {
  adelanto: "Adelanto pendiente",
  saldo: "Saldo",
};

/** "Registrar pago" (ventas y admin, Paso 11.2): monto sugerido, método y fecha. */
export function RegisterPaymentDialog({
  restorationId,
  balanceCents,
  suggested,
  methods,
}: {
  restorationId: string;
  balanceCents: Cents;
  suggested: SuggestedPayment | null;
  methods: MethodOption[];
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => newDraft(suggested?.amount ?? null));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const read = readDraft(draft, balanceCents);
    if ("error" in read) return setError(read.error);
    setError(null);
    startTransition(async () => {
      const result = await registerPayment(restorationId, read.input);
      if ("error" in result) return setError(result.error);
      toast.success(`Pago de ${formatCents(read.totalCents)} registrado.`);
      setOpen(false);
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setDraft(newDraft(suggested?.amount ?? null));
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button disabled={balanceCents <= 0}>
          <Banknote />
          Registrar pago
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Registrar pago</DialogTitle>
            <DialogDescription>
              Saldo: {formatCents(balanceCents)}
              {suggested
                ? ` · ${SUGGESTION_LABELS[suggested.kind]}: ${formatCents(suggested.amount)}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {error ? <FormAlert>{error}</FormAlert> : null}
          <PaymentFields
            draft={draft}
            onChange={setDraft}
            methods={methods}
            idPrefix="pago"
          />
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
