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
  type BranchOption,
  type MethodOption,
} from "./payment-fields";

const SUGGESTION_LABELS: Record<SuggestedPayment["kind"], string> = {
  adelanto: "Adelanto pendiente",
  saldo: "Saldo",
};

/**
 * "Registrar pago" (ventas y admin, Paso 11.2): sucursal, monto sugerido, método y
 * fecha. El admin puede registrarlo solo en el sistema (`canSkipShopify`), para
 * corregir un cobro que se hizo creando el pedido directamente en Shopify o, en una
 * guía antigua (`hasOrder`), conciliar pagos ya hechos sin tocar su orden de piezas.
 */
export function RegisterPaymentDialog({
  restorationId,
  balanceCents,
  suggested,
  methods,
  branches,
  canSkipShopify = false,
  hasOrder = false,
}: {
  restorationId: string;
  balanceCents: Cents;
  suggested: SuggestedPayment | null;
  methods: MethodOption[];
  branches: BranchOption[];
  canSkipShopify?: boolean;
  /** Guía antigua, con su orden de piezas en Shopify. */
  hasOrder?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => newDraft(suggested?.amount ?? null));
  const [skipShopify, setSkipShopify] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const read = readDraft(draft, balanceCents);
    if ("error" in read) return setError(read.error);
    setError(null);
    startTransition(async () => {
      const result = await registerPayment(restorationId, {
        ...read.input,
        skipShopify: canSkipShopify && skipShopify,
      });
      if ("error" in result) return setError(result.error);
      toast.success(
        `Pago de ${formatCents(read.totalCents)} registrado${skipShopify ? " solo en el sistema" : ""}.`,
      );
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
          setSkipShopify(false);
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
            branches={branches}
            idPrefix="pago"
          />
          {canSkipShopify ? (
            <div className="space-y-1">
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  className="accent-primary size-4"
                  checked={skipShopify}
                  onChange={(e) => setSkipShopify(e.target.checked)}
                />
                {hasOrder
                  ? "Solo en el sistema (no tocar la orden de Shopify)"
                  : "Solo en el sistema (no crear pedido en Shopify)"}
              </label>
              <p className="text-muted-foreground text-xs">
                {hasOrder
                  ? "Para conciliar un pago que ya se hizo. La orden de piezas de Shopify queda como está: este pago y los que sigan quedan solo en el sistema."
                  : "Para corregir un cobro que ya se hizo creando el pedido directamente en Shopify."}
              </p>
            </div>
          ) : null}
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
