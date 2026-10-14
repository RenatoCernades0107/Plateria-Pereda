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
import { cn } from "@/lib/utils";
import { setPieceSalePrice } from "@/server/sale-price-actions";
import { setPieceServiceCost } from "@/server/service-cost-actions";

import { PriceChangeDialog } from "./price-change-dialog";

type MoneyPiece = { id: string; code: string; restorationId: string };

type SaveResult = { error: string } | { ok: true } | object;

/**
 * Monto con un botón de lápiz que abre un diálogo para cambiarlo (pedido del
 * 2026-10-14): la celda muestra el monto (o el texto vacío) y la edición es una acción
 * explícita, igual en la tabla de piezas, la guía y el detalle de la pieza.
 */
function MoneyEditCell({
  cents,
  emptyText,
  fieldLabel,
  title,
  description,
  buttonLabel,
  buttonTitle,
  submitText,
  savedMessage,
  inputId,
  align = "end",
  onSave,
}: {
  cents: Cents | null;
  emptyText: string;
  fieldLabel: string;
  title: string;
  description: string;
  buttonLabel: string;
  buttonTitle: string;
  submitText: string;
  savedMessage: string;
  inputId: string;
  align?: "start" | "end";
  onSave: (value: string) => Promise<SaveResult>;
}) {
  const saved = cents === null ? "" : toDecimalString(cents);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(saved);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    const text = value.trim();
    if (text !== "" && parseMoney(text) === null) {
      return setError("Ingresa un monto válido (hasta 2 decimales).");
    }
    startTransition(async () => {
      const result = await onSave(text);
      if ("error" in result && typeof result.error === "string") {
        return setError(result.error);
      }
      toast.success(savedMessage);
      setOpen(false);
    });
  };

  return (
    <div
      className={cn(
        "flex items-center gap-1 whitespace-nowrap",
        align === "end" ? "justify-end" : "justify-start",
      )}
    >
      {cents === null ? (
        <span className="text-muted-foreground">{emptyText}</span>
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
            aria-label={buttonLabel}
            title={buttonTitle}
          >
            <Pencil />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <form onSubmit={submit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>{description}</DialogDescription>
            </DialogHeader>
            {error ? <FormAlert>{error}</FormAlert> : null}
            <div className="space-y-2">
              <Label htmlFor={inputId}>{fieldLabel}</Label>
              <Input
                id={inputId}
                inputMode="decimal"
                className="tabular-nums"
                placeholder={emptyText}
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
                {submitText}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Costo de servicio (admin y logística, P55): monto y lápiz que abre un diálogo. */
export function ServiceCostCell({
  piece,
  cents,
  align,
}: {
  piece: MoneyPiece;
  cents: Cents | null;
  align?: "start" | "end";
}) {
  return (
    <MoneyEditCell
      cents={cents}
      align={align}
      emptyText="Por definir"
      fieldLabel="Costo de servicio (S/)"
      title={`Costo de servicio de ${piece.code}`}
      description="Lo que cobra el taller por esta pieza. Déjalo vacío si aún no se define."
      buttonLabel={`Editar costo de servicio de ${piece.code}`}
      buttonTitle="Editar costo de servicio"
      submitText="Guardar costo"
      savedMessage={`Costo de ${piece.code} guardado.`}
      inputId={`costo-servicio-${piece.id}`}
      onSave={(value) => setPieceServiceCost(piece.id, value)}
    />
  );
}

/**
 * Costo de servicio en la tabla de piezas: el monto con su lápiz salvo en el modo
 * «Editar costo de servicio» (admin y logística), donde todas las filas muestran el
 * campo con su botón de guardar, como en «Editar precio de venta».
 */
export function BoardServiceCostCell({
  piece,
  cents,
  editing,
}: {
  piece: MoneyPiece;
  cents: Cents | null;
  editing: boolean;
}) {
  if (!editing) return <ServiceCostCell piece={piece} cents={cents} />;
  return (
    <MoneyCell
      // Al entrar al modo edición el campo parte del costo guardado.
      key={`${editing}-${cents}`}
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
 * Precio de venta: el admin lo asigna con el lápiz (D58); con la orden de Shopify
 * creada un precio ya asignado se cambia con motivo ("Cambiar precio", P12). Ventas
 * solo lo ve.
 */
export function SalePriceCell({
  piece,
  cents,
  hasOrder,
  editable,
  align,
}: {
  piece: MoneyPiece;
  cents: Cents | null;
  hasOrder: boolean;
  editable: boolean;
  align?: "start" | "end";
}) {
  if (!editable) {
    return cents === null ? (
      <span className="text-muted-foreground">Sin asignar</span>
    ) : (
      <span className="tabular-nums">{formatCents(cents)}</span>
    );
  }
  if (hasOrder && cents !== null) {
    return (
      <div
        className={cn(
          "flex flex-col gap-1",
          align === "start" ? "items-start" : "items-end",
        )}
      >
        <span className="tabular-nums">{formatCents(cents)}</span>
        <PriceChangeDialog
          restorationId={piece.restorationId}
          piece={{ id: piece.id, code: piece.code, priceCents: cents }}
        />
      </div>
    );
  }
  return (
    <MoneyEditCell
      cents={cents}
      align={align}
      emptyText="Sin asignar"
      fieldLabel="Precio de venta (S/)"
      title={`Precio de venta de ${piece.code}`}
      description="Precio que se cobra al cliente por esta pieza. Déjalo vacío si aún no se asigna."
      buttonLabel={`Editar precio de venta de ${piece.code}`}
      buttonTitle="Editar precio de venta"
      submitText="Guardar precio"
      savedMessage={`Precio de ${piece.code} guardado.`}
      inputId={`precio-venta-${piece.id}`}
      onSave={(value) => setPieceSalePrice(piece.id, value)}
    />
  );
}

/**
 * Precio de venta en la tabla de piezas: texto de solo lectura salvo en el modo
 * «Editar precio de venta» (solo admin), donde todas las filas muestran el campo. Si la orden
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
