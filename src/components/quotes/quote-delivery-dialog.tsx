"use client";

import { CalendarDays } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
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
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  formatDeliveryDate,
  isDeliveryOverdue,
  isIsoDate,
  todayInLima,
} from "@/domain/delivery-date";
import { addDays } from "@/domain/quote";
import {
  defaultSupplierDeliveryDate,
  quoteDeliveryDatesError,
  SUPPLIER_LEAD_DAYS,
} from "@/domain/quote-delivery";
import { cn } from "@/lib/utils";
import {
  changeQuoteStatus,
  setQuoteDeliveryDates,
} from "@/server/quotes/actions";

import { quoteDeliveryText } from "./quote-delivery-dates";

/**
 * Diálogo de las fechas de entrega de una cotización: al aceptarla (`mode="aceptar"`,
 * el cliente la aprobó) o para cambiarlas después (`"editar"`). La del proveedor se
 * completa sola con 3 días antes de la de entrega mientras no se cambie a mano.
 */
export function QuoteDeliveryDialog({
  open,
  onOpenChange,
  quoteId,
  mode,
  deliveryDays,
  deliveryDate,
  supplierDeliveryDate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quoteId: string;
  mode: "aceptar" | "editar";
  /** Tiempo de entrega de la cotización: sugiere la fecha al aceptarla. */
  deliveryDays: number;
  deliveryDate: string | null;
  supplierDeliveryDate: string | null;
}) {
  const router = useRouter();
  const today = todayInLima();
  const initialDate = deliveryDate ?? addDays(today, deliveryDays);
  const [date, setDate] = useState(initialDate);
  const [supplierDate, setSupplierDate] = useState(
    supplierDeliveryDate ?? defaultSupplierDeliveryDate(initialDate, today),
  );
  // Mientras no se toque, la del proveedor sigue a la de entrega.
  const [supplierTouched, setSupplierTouched] = useState(
    supplierDeliveryDate !== null &&
      supplierDeliveryDate !==
        defaultSupplierDeliveryDate(deliveryDate ?? initialDate, today),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dateId = useId();
  const supplierId = useId();

  const changeDate = (value: string) => {
    setDate(value);
    if (!supplierTouched && isIsoDate(value)) {
      setSupplierDate(defaultSupplierDeliveryDate(value, today));
    }
  };

  const save = () => {
    const invalid = quoteDeliveryDatesError(date, supplierDate, today, {
      deliveryDate,
      supplierDate: supplierDeliveryDate,
    });
    if (invalid) return setError(`${invalid}.`);
    setError(null);
    startTransition(async () => {
      const dates = { deliveryDate: date, supplierDeliveryDate: supplierDate };
      const result =
        mode === "aceptar"
          ? await changeQuoteStatus(quoteId, "aceptada", dates)
          : await setQuoteDeliveryDates(quoteId, dates);
      if ("error" in result) return setError(result.error);
      toast.success(
        mode === "aceptar"
          ? `Cotización aceptada: entrega el ${formatDeliveryDate(date)}.`
          : "Fechas de entrega guardadas.",
      );
      onOpenChange(false);
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "aceptar" ? "Marcar aceptada" : "Fechas de entrega"}
          </DialogTitle>
          <DialogDescription>
            {mode === "aceptar"
              ? "El cliente aprobó la cotización: indica cuándo se entrega. "
              : ""}
            La del proveedor queda {SUPPLIER_LEAD_DAYS} días antes si no la
            cambias.
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          {error ? <FormAlert>{error}</FormAlert> : null}
          <div className="space-y-2">
            <Label htmlFor={dateId}>Fecha de entrega</Label>
            <Input
              id={dateId}
              type="date"
              min={today}
              value={date}
              onChange={(e) => changeDate(e.target.value)}
              disabled={pending}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={supplierId}>Fecha de entrega del proveedor</Label>
            <Input
              id={supplierId}
              type="date"
              min={today}
              max={date || undefined}
              value={supplierDate}
              onChange={(e) => {
                setSupplierTouched(true);
                setSupplierDate(e.target.value);
              }}
              disabled={pending}
            />
            <p className="text-muted-foreground text-xs">
              En blanco: {SUPPLIER_LEAD_DAYS} días antes de la fecha de entrega.
            </p>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending
                ? "Guardando…"
                : mode === "aceptar"
                  ? "Marcar aceptada"
                  : "Guardar fechas"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Fechas de entrega en el detalle de una cotización aceptada: botón que abre el
 * diálogo para colocarlas o cambiarlas.
 */
export function QuoteDeliveryButton({
  quoteId,
  deliveryDays,
  deliveryDate,
  supplierDeliveryDate,
}: {
  quoteId: string;
  deliveryDays: number;
  deliveryDate: string | null;
  supplierDeliveryDate: string | null;
}) {
  const [open, setOpen] = useState(false);
  const overdue = deliveryDate !== null && isDeliveryOverdue(deliveryDate);
  return (
    <>
      <button
        type="button"
        className={cn(
          "inline-flex items-center gap-1 text-sm underline-offset-4 hover:underline",
          !deliveryDate
            ? "text-amber-700 dark:text-amber-300"
            : overdue
              ? "text-destructive"
              : "text-muted-foreground",
        )}
        data-testid="fechas-entrega-cotizacion"
        title={
          deliveryDate
            ? "Cambiar las fechas de entrega"
            : "Colocar la fecha de entrega"
        }
        onClick={() => setOpen(true)}
      >
        <CalendarDays aria-hidden className="size-4" />
        {deliveryDate
          ? quoteDeliveryText(deliveryDate, supplierDeliveryDate)
          : "Colocar fecha de entrega"}
        {overdue ? " (vencida)" : null}
      </button>
      <QuoteDeliveryDialog
        key={open ? "abierto" : "cerrado"}
        open={open}
        onOpenChange={setOpen}
        quoteId={quoteId}
        mode="editar"
        deliveryDays={deliveryDays}
        deliveryDate={deliveryDate}
        supplierDeliveryDate={supplierDeliveryDate}
      />
    </>
  );
}
