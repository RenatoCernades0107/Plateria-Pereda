"use client";

import { Check, Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCents, toDecimalString, type Cents } from "@/domain/money";
import { setPieceServiceCost } from "@/server/service-cost-actions";

/**
 * Costo de servicio de una pieza. Con `editable` (admin y logística) es un campo
 * que se guarda con el botón o con Enter; en pantalla de solo lectura, y al
 * imprimir, es solo el monto ("Por definir" si el taller aún no lo pasa).
 */
export function ServiceCostCell({
  pieceId,
  pieceCode,
  cents,
  editable,
}: {
  pieceId: string;
  pieceCode: string;
  cents: Cents | null;
  editable: boolean;
}) {
  const saved = cents === null ? "" : toDecimalString(cents);
  const [value, setValue] = useState(saved);
  const [pending, startTransition] = useTransition();

  const readOnly =
    cents === null ? (
      <span className="text-muted-foreground">Por definir</span>
    ) : (
      <span className="tabular-nums">{formatCents(cents)}</span>
    );
  if (!editable) return readOnly;

  const save = () =>
    startTransition(async () => {
      const result = await setPieceServiceCost(pieceId, value);
      if ("error" in result) toast.error(result.error);
      else toast.success(`Costo de ${pieceCode} guardado.`);
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
          placeholder="0.00"
          aria-label={`Costo de servicio de ${pieceCode}`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={pending}
        />
        <Button
          type="submit"
          size="icon"
          variant="outline"
          className="size-8"
          aria-label={`Guardar costo de ${pieceCode}`}
          disabled={pending || value.trim() === saved}
        >
          {pending ? <Loader2 className="animate-spin" /> : <Check />}
        </Button>
      </form>
      <span className="hidden print:inline">{readOnly}</span>
    </>
  );
}
