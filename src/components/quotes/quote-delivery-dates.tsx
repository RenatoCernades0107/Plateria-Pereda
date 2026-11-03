import { CalendarDays } from "lucide-react";

import { formatDeliveryDate, isDeliveryOverdue } from "@/domain/delivery-date";
import { cn } from "@/lib/utils";

/** "Entrega 30 oct · Proveedor 27 oct", en rojo si la entrega ya pasó. */
export function quoteDeliveryText(
  deliveryDate: string,
  supplierDeliveryDate: string | null,
): string {
  return `Entrega ${formatDeliveryDate(deliveryDate)}${
    supplierDeliveryDate
      ? ` · Proveedor ${formatDeliveryDate(supplierDeliveryDate)}`
      : ""
  }`;
}

/** Fechas de entrega de una cotización aceptada (texto, para listados). */
export function QuoteDeliveryDates({
  deliveryDate,
  supplierDeliveryDate,
  className,
}: {
  deliveryDate: string | null;
  supplierDeliveryDate: string | null;
  className?: string;
}) {
  if (!deliveryDate) return null;
  const overdue = isDeliveryOverdue(deliveryDate);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs",
        overdue ? "text-destructive" : "text-muted-foreground",
        className,
      )}
      data-testid="fechas-entrega-cotizacion"
    >
      <CalendarDays aria-hidden className="size-3.5 shrink-0" />
      {quoteDeliveryText(deliveryDate, supplierDeliveryDate)}
      {overdue ? " (vencida)" : null}
    </span>
  );
}
