"use client";

import { Check, Pencil, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { EmptyState } from "@/components/empty-state";
import type { MethodOption } from "@/components/payments/payment-fields";
import { PaymentStatusBadge } from "@/components/restorations/status-badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCents, type Cents } from "@/domain/money";
import { MAX_INVOICE_NUMBER_LENGTH } from "@/domain/quote-payments";
import { formatDate } from "@/lib/format";
import type { QuotePayments } from "@/server/quotes/queries";
import {
  deleteQuotePayment,
  setQuotePaymentInvoice,
} from "@/server/quotes/payment-actions";

import { RegisterQuotePaymentDialog } from "./register-quote-payment-dialog";

/** N.º de factura de un pago, con lápiz para asignarlo o cambiarlo. */
function InvoiceCell({
  quoteId,
  paymentId,
  value,
}: {
  quoteId: string;
  paymentId: string;
  value: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value ?? "");
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      const result = await setQuotePaymentInvoice(quoteId, paymentId, text);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(
        text.trim() ? "Número de factura guardado." : "Se quitó la factura.",
      );
      setEditing(false);
      router.refresh();
    });

  if (!editing) {
    return (
      <span className="inline-flex items-center gap-1">
        <span data-testid="factura-pago">
          {value ?? <span className="text-muted-foreground">Sin factura</span>}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={
            value ? "Cambiar el número de factura" : "Asignar factura"
          }
          onClick={() => {
            setText(value ?? "");
            setEditing(true);
          }}
        >
          <Pencil aria-hidden />
        </Button>
      </span>
    );
  }
  return (
    <form
      className="flex items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <Input
        value={text}
        autoFocus
        maxLength={MAX_INVOICE_NUMBER_LENGTH}
        aria-label="Número de factura"
        className="h-8 w-40"
        disabled={pending}
        onChange={(e) => setText(e.target.value)}
      />
      <Button
        type="submit"
        size="icon"
        className="size-8"
        aria-label="Guardar factura"
        disabled={pending}
      >
        <Check aria-hidden />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8"
        aria-label="Cancelar"
        disabled={pending}
        onClick={() => setEditing(false)}
      >
        <X aria-hidden />
      </Button>
    </form>
  );
}

/**
 * Pagos de una cotización aceptada o facturada: total, pagado y saldo, el historial con
 * el N.º de factura de cada pago y «Registrar pago». El admin elimina un pago hecho por
 * error. Solo admin y ventas (la página no lo renderiza para logística).
 */
export function QuotePaymentsSection({
  quoteId,
  totalCents,
  data,
  methods,
  canRegister,
  canDelete,
}: {
  quoteId: string;
  totalCents: Cents;
  data: QuotePayments;
  methods: MethodOption[];
  /** La cotización está aceptada o facturada. */
  canRegister: boolean;
  /** Solo el admin elimina un pago. */
  canDelete: boolean;
}) {
  const router = useRouter();
  const { payments, paidCents, balanceCents, status } = data;
  return (
    <section
      aria-labelledby="pagos-cotizacion"
      className="space-y-4 rounded-lg border p-4"
      data-testid="pagos-cotizacion"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <h2 id="pagos-cotizacion" className="text-heading font-semibold">
            Pagos
          </h2>
          <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <div>
              <dt className="text-muted-foreground text-xs">Total</dt>
              <dd
                className="font-medium tabular-nums"
                data-testid="monto-total"
              >
                {formatCents(totalCents)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Pagado</dt>
              <dd
                className="font-medium tabular-nums"
                data-testid="monto-pagado"
              >
                {formatCents(paidCents)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Saldo</dt>
              <dd
                className="text-heading font-semibold tabular-nums"
                data-testid="monto-saldo"
              >
                {formatCents(balanceCents)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Estado</dt>
              <dd>
                <PaymentStatusBadge status={status} />
              </dd>
            </div>
          </dl>
        </div>
        {canRegister ? (
          <RegisterQuotePaymentDialog
            quoteId={quoteId}
            balanceCents={balanceCents}
            methods={methods}
          />
        ) : null}
      </div>
      {payments.length === 0 ? (
        <EmptyState>Aún no hay pagos registrados.</EmptyState>
      ) : (
        <Table aria-label="Historial de pagos de la cotización">
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Método</TableHead>
              <TableHead className="text-right">Monto</TableHead>
              <TableHead>Factura</TableHead>
              <TableHead>Registró</TableHead>
              {canDelete ? (
                <TableHead className="w-10">
                  <span className="sr-only">Acciones</span>
                </TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.map((p) => (
              <TableRow key={p.id} data-testid="pago-cotizacion">
                <TableCell>{formatDate(`${p.paidOn}T12:00:00`)}</TableCell>
                <TableCell>{p.methodName}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCents(p.amountCents)}
                </TableCell>
                <TableCell>
                  <InvoiceCell
                    quoteId={quoteId}
                    paymentId={p.id}
                    value={p.invoiceNumber}
                  />
                </TableCell>
                <TableCell>{p.createdByName ?? "—"}</TableCell>
                {canDelete ? (
                  <TableCell>
                    <ConfirmDeleteDialog
                      title="Eliminar pago"
                      name={`Pago de ${formatCents(p.amountCents)}`}
                      hint="Úsalo solo si se registró por error."
                      onConfirm={async () => {
                        const result = await deleteQuotePayment(quoteId, p.id);
                        if ("ok" in result) router.refresh();
                        return result;
                      }}
                      trigger={
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          aria-label={`Eliminar el pago de ${formatCents(p.amountCents)}`}
                        >
                          <Trash2 aria-hidden />
                        </Button>
                      }
                    />
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
