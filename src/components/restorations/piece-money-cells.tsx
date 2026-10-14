"use client";

import { Loader2, Pencil } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { FormAlert } from "@/components/auth/form-alert";
import { MoneyCell } from "@/components/money-cell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  formatCents,
  parseMoney,
  toDecimalString,
  type Cents,
} from "@/domain/money";
import { setPieceSalePrice } from "@/server/sale-price-actions";
import { setPieceServiceCost } from "@/server/service-cost-actions";

import { PriceChangeDialog } from "./price-change-dialog";

type MoneyPiece = { id: string; code: string; restorationId: string };

/** Costo de servicio editable (admin y logística, P55). */
export function ServiceCostInput({
  piece,
  cents,
}: {
  piece: MoneyPiece;
  cents: Cents | null;
}) {
  return (
    <MoneyCell
      cents={cents}
      editable
      emptyText="Por definir"
      inputLabel={`Costo de servicio de ${piece.code}`}
      saveLabel={`Guardar costo de ${piece.code}`}
      savedMessage={`Costo de ${piece.code} guardado.`}
      onSave={(value) => setPieceServiceCost(piece.id, value)}
    />
  );
}

/**
 * Costo de servicio en la tabla de piezas (pedido del 2026-10-14): la celda muestra
 * el monto (o "Por definir") y un botón con lápiz abre un diálogo para cambiarlo.
 * Así la tabla no se llena de campos y la edición es una acción explícita.
 */
export function ServiceCostCell({
  piece,
  cents,
}: {
  piece: MoneyPiece;
  cents: Cents | null;
}) {
  const saved = cents === null ? "" : toDecimalString(cents);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(saved);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputId = `costo-servicio-${piece.id}`;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    const text = value.trim();
    if (text !== "" && parseMoney(text) === null) {
      return setError("Ingresa un monto válido (hasta 2 decimales).");
    }
    startTransition(async () => {
      const result = await setPieceServiceCost(piece.id, text);
      if ("error" in result) return setError(result.error);
      toast.success(`Costo de ${piece.code} guardado.`);
      setOpen(false);
    });
  };

  return (
    <div className="flex items-center justify-end gap-1">
      {cents === null ? (
        <span className="text-muted-foreground">Por definir</span>
      ) : (
        <span className="tabular-nums">{formatCents(cents)}</span>
      )}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) {
            setValue(saved);
            setError(null);
          }
        }}
      >
        <DialogTrigger asChild>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-7 print:hidden"
            aria-label={`Editar costo de servicio de ${piece.code}`}
            title="Editar costo de servicio"
          >
            <Pencil />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <form onSubmit={submit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Costo de servicio de {piece.code}</DialogTitle>
              <DialogDescription>
                Lo que cobra el taller por esta pieza. Déjalo vacío si aún no se
                define.
              </DialogDescription>
            </DialogHeader>
            {error ? <FormAlert>{error}</FormAlert> : null}
            <div className="space-y-2">
              <Label htmlFor={inputId}>Costo de servicio (S/)</Label>
              <Input
                id={inputId}
                inputMode="decimal"
                className="tabular-nums"
                placeholder="Por definir"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                disabled={pending}
                autoFocus
              />
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancelar
                </Button>
              </DialogClose>
              <Button type="submit" disabled={pending}>
                {pending ? <Loader2 className="animate-spin" /> : null}
                Guardar costo
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Precio de venta: el admin lo ingresa (D58); con la orden de Shopify creada un precio
 * ya asignado se cambia con motivo ("Cambiar precio", P12). Ventas solo lo ve.
 */
export function SalePriceInput({
  piece,
  cents,
  hasOrder,
  editable,
}: {
  piece: MoneyPiece;
  cents: Cents | null;
  hasOrder: boolean;
  editable: boolean;
}) {
  if (editable && hasOrder && cents !== null) {
    return (
      <div className="flex flex-col items-end gap-1">
        <span className="tabular-nums">{formatCents(cents)}</span>
        <PriceChangeDialog
          restorationId={piece.restorationId}
          piece={{ id: piece.id, code: piece.code, priceCents: cents }}
        />
      </div>
    );
  }
  return (
    <MoneyCell
      cents={cents}
      editable={editable}
      emptyText="Sin asignar"
      inputLabel={`Precio de venta de ${piece.code}`}
      saveLabel={`Guardar precio de ${piece.code}`}
      savedMessage={`Precio de ${piece.code} guardado.`}
      onSave={(value) => setPieceSalePrice(piece.id, value)}
    />
  );
}

/**
 * Precio de venta en la tabla de piezas: texto de solo lectura salvo en el modo
 * «Editar precios» (solo admin), donde todas las filas muestran el campo. Si la orden
 * de Shopify ya está creada, guardar abre el cambio de precio con motivo (P12).
 */
export function BoardSalePriceCell({
  piece,
  cents,
  hasOrder,
  editing,
}: {
  piece: MoneyPiece;
  cents: Cents | null;
  hasOrder: boolean;
  editing: boolean;
}) {
  const [proposed, setProposed] = useState<Cents | null>(null);
  const withReason = hasOrder && cents !== null;
  return (
    <>
      <MoneyCell
        // Al entrar o salir del modo edición el campo vuelve al precio guardado.
        key={`${editing}-${cents}`}
        cents={cents}
        editable={editing}
        emptyText="Sin asignar"
        inputLabel={`Precio de venta de ${piece.code}`}
        saveLabel={`Guardar precio de ${piece.code}`}
        savedMessage={`Precio de ${piece.code} guardado.`}
        onSave={async (value) => {
          if (!withReason) return setPieceSalePrice(piece.id, value);
          const next = parseMoney(value.trim());
          if (next === null) {
            return { error: "Ingresa un monto válido (hasta 2 decimales)." };
          }
          setProposed(next);
          return { pending: true };
        }}
      />
      {withReason && proposed !== null ? (
        <PriceChangeDialog
          key={proposed}
          restorationId={piece.restorationId}
          piece={{ id: piece.id, code: piece.code, priceCents: cents }}
          proposedCents={proposed}
          open
          onOpenChange={(open) => !open && setProposed(null)}
        />
      ) : null}
    </>
  );
}
