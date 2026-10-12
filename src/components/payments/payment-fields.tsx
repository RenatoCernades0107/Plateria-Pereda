"use client";

import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCents, parseMoney, type Cents } from "@/domain/money";
import type { PaymentInput } from "@/server/payments/actions";

export type MethodOption = { id: string; name: string };

export type PaymentRow = { methodId: string; amount: string };

export type PaymentDraft = { paidOn: string; rows: PaymentRow[] };

/** Hoy en Lima (AAAA-MM-DD). */
export const todayInLima = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(
    new Date(),
  );

export const newDraft = (amountCents: Cents | null): PaymentDraft => ({
  paidOn: todayInLima(),
  rows: [
    {
      methodId: "",
      amount: amountCents ? (amountCents / 100).toFixed(2) : "",
    },
  ],
});

/**
 * Valida el borrador: cada fila con método y monto > 0 y, si se da `maxCents`, que
 * la suma no pase del saldo. Devuelve el pago o el mensaje de error.
 */
export function readDraft(
  draft: PaymentDraft,
  maxCents: Cents | null,
): { input: PaymentInput; totalCents: Cents } | { error: string } {
  const rows: PaymentInput["rows"] = [];
  for (const row of draft.rows) {
    const amountCents = parseMoney(row.amount);
    if (!row.methodId) return { error: "Elige el método de pago." };
    if (amountCents === null || amountCents <= 0)
      return { error: "Ingresa un monto mayor que 0 (hasta 2 decimales)." };
    rows.push({ methodId: row.methodId, amountCents });
  }
  const totalCents = rows.reduce((s, r) => s + r.amountCents, 0);
  if (maxCents !== null && totalCents > maxCents)
    return {
      error: `El monto supera el saldo pendiente (${formatCents(maxCents)}).`,
    };
  if (!draft.paidOn) return { error: "Elige la fecha del pago." };
  return { input: { paidOn: draft.paidOn, rows }, totalCents };
}

/** Monto, método y fecha; se puede repartir en varios métodos (Paso 11.2). */
export function PaymentFields({
  draft,
  onChange,
  methods,
  idPrefix,
  single = false,
}: {
  draft: PaymentDraft;
  onChange: (draft: PaymentDraft) => void;
  methods: MethodOption[];
  idPrefix: string;
  /** Un solo método (reembolsos). */
  single?: boolean;
}) {
  const setRow = (i: number, patch: Partial<PaymentRow>) =>
    onChange({
      ...draft,
      rows: draft.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)),
    });
  return (
    <div className="space-y-3">
      {draft.rows.map((row, i) => (
        <div
          key={i}
          className="grid grid-cols-[1fr_8rem_auto] items-end gap-2"
          data-testid="fila-pago"
        >
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-metodo-${i}`}>Método</Label>
            <Select
              value={row.methodId}
              onValueChange={(methodId) => setRow(i, { methodId })}
            >
              <SelectTrigger id={`${idPrefix}-metodo-${i}`} className="w-full">
                <SelectValue placeholder="Elige" />
              </SelectTrigger>
              <SelectContent>
                {methods.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-monto-${i}`}>Monto (S/)</Label>
            <Input
              id={`${idPrefix}-monto-${i}`}
              inputMode="decimal"
              value={row.amount}
              onChange={(e) => setRow(i, { amount: e.target.value })}
            />
          </div>
          {draft.rows.length > 1 ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Quitar método ${i + 1}`}
              onClick={() =>
                onChange({
                  ...draft,
                  rows: draft.rows.filter((_, j) => j !== i),
                })
              }
            >
              <X />
            </Button>
          ) : (
            <span className="size-9" />
          )}
        </div>
      ))}
      {!single && draft.rows.length < 5 ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            onChange({
              ...draft,
              rows: [...draft.rows, { methodId: "", amount: "" }],
            })
          }
        >
          <Plus />
          Otro método
        </Button>
      ) : null}
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-fecha`}>Fecha</Label>
        <Input
          id={`${idPrefix}-fecha`}
          type="date"
          max={todayInLima()}
          value={draft.paidOn}
          onChange={(e) => onChange({ ...draft, paidOn: e.target.value })}
          className="w-44"
        />
      </div>
    </div>
  );
}
