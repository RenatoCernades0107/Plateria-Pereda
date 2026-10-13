"use client";

import { Check, Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCents, toDecimalString, type Cents } from "@/domain/money";

/**
 * Monto editable en una celda de tabla (costo de servicio, precio de venta). Con
 * `editable` es un campo que se guarda con el botón o con Enter; si no, y al imprimir,
 * es solo el monto (`emptyText` si aún no hay).
 */
export function MoneyCell({
  cents,
  editable,
  emptyText,
  inputLabel,
  saveLabel,
  savedMessage,
  onSave,
}: {
  cents: Cents | null;
  editable: boolean;
  emptyText: string;
  /** Nombre accesible del campo, p. ej. "Costo de servicio de RES-00001-1". */
  inputLabel: string;
  /** Nombre accesible del botón, p. ej. "Guardar costo de RES-00001-1". */
  saveLabel: string;
  savedMessage: string;
  onSave: (value: string) => Promise<{ ok: true } | { error: string }>;
}) {
  const saved = cents === null ? "" : toDecimalString(cents);
  const [value, setValue] = useState(saved);
  const [pending, startTransition] = useTransition();

  const readOnly =
    cents === null ? (
      <span className="text-muted-foreground">{emptyText}</span>
    ) : (
      <span className="tabular-nums">{formatCents(cents)}</span>
    );
  if (!editable) return readOnly;

  const save = () =>
    startTransition(async () => {
      const result = await onSave(value);
      if ("error" in result) toast.error(result.error);
      else toast.success(savedMessage);
    });

  return (
    <>
      <form
        className="flex items-center justify-end gap-1 print:hidden"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Input
          inputMode="decimal"
          className="h-8 w-24 text-right tabular-nums"
          placeholder={cents === null ? emptyText : "0.00"}
          aria-label={inputLabel}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={pending}
        />
        <Button
          type="submit"
          size="icon"
          variant="outline"
          className="size-8"
          aria-label={saveLabel}
          disabled={pending || value.trim() === saved}
        >
          {pending ? <Loader2 className="animate-spin" /> : <Check />}
        </Button>
      </form>
      <span className="hidden print:inline">{readOnly}</span>
    </>
  );
}
