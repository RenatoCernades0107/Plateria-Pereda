"use client";

import { Loader2, Pencil, Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { FormAlert } from "@/components/auth/form-alert";
import { EDIT_ICON_CLASS } from "@/components/icons/icon-colors";
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
 * Dato editable que aún falta (p. ej. "Definir precio" en la ficha de la pieza): un
 * botón secundario con borde punteado, para que se vea como acción y no como texto.
 */
export const EMPTY_VALUE_BUTTON_CLASS =
  "text-muted-foreground hover:text-foreground border-dashed font-normal print:hidden";

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
  emptyActionText,
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
  /** Sin monto, el botón muestra este texto (p. ej. "Definir precio") en vez del lápiz. */
  emptyActionText?: string;
  onSave: (value: string) => Promise<SaveResult>;
}) {
  const emptyAction = cents === null && emptyActionText !== undefined;
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
      {emptyAction ? null : cents === null ? (
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
          {emptyAction ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={EMPTY_VALUE_BUTTON_CLASS}
              aria-label={buttonLabel}
            >
              <Plus aria-hidden />
              {emptyActionText}
            </Button>
          ) : (
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="size-7 print:hidden pointer-coarse:size-10"
              aria-label={buttonLabel}
              title={buttonTitle}
            >
              <Pencil className={EDIT_ICON_CLASS} />
            </Button>
          )}
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
  emptyAsButton = false,
}: {
  piece: MoneyPiece;
  cents: Cents | null;
  align?: "start" | "end";
  /** Sin costo, un botón "Definir costo" en vez de "Por definir" y el lápiz. */
  emptyAsButton?: boolean;
}) {
  return (
    <MoneyEditCell
      cents={cents}
      align={align}
      emptyActionText={emptyAsButton ? "Definir costo" : undefined}
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

/** Monto de solo lectura de las tablas: el importe o "Por definir". */
function PlainAmount({ cents }: { cents: Cents | null }) {
  return cents === null ? (
    <span className="text-muted-foreground">Por definir</span>
  ) : (
    <span className="tabular-nums">{formatCents(cents)}</span>
  );
}

/**
 * Costo de servicio en la tabla de piezas: el lápiz solo sale si aún está "Por
 * definir" (admin y logística); un costo ya puesto se cambia desde el detalle de la
 * pieza.
 */
export function BoardServiceCostCell({
  piece,
  cents,
}: {
  piece: MoneyPiece;
  cents: Cents | null;
}) {
  if (cents !== null) return <PlainAmount cents={cents} />;
  return <ServiceCostCell piece={piece} cents={cents} />;
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
  emptyAsButton = false,
}: {
  piece: MoneyPiece;
  cents: Cents | null;
  hasOrder: boolean;
  editable: boolean;
  align?: "start" | "end";
  /** Sin precio, un botón "Definir precio" en vez de "Por definir" y el lápiz. */
  emptyAsButton?: boolean;
}) {
  if (!editable) return <PlainAmount cents={cents} />;
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
      emptyActionText={emptyAsButton ? "Definir precio" : undefined}
      emptyText="Por definir"
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
 * Precio de venta en la tabla de piezas: el admin ve el lápiz solo si aún está "Por
 * definir" (D58); un precio ya asignado se cambia desde el detalle de la pieza (con
 * motivo si la orden de Shopify ya está creada, P12).
 */
export function BoardSalePriceCell({
  piece,
  cents,
  editable,
}: {
  piece: MoneyPiece;
  cents: Cents | null;
  editable: boolean;
}) {
  if (!editable || cents !== null) return <PlainAmount cents={cents} />;
  return (
    <SalePriceCell piece={piece} cents={cents} hasOrder={false} editable />
  );
}
