/**
 * Fechas de entrega de una cotización aceptada (2026-11-03): al cliente (obligatoria al
 * aceptarla) y del proveedor (por defecto 3 días antes, nunca posterior). Como las de
 * las piezas urgentes; la BD aplica las mismas reglas (quote_guard_update).
 */
import { DELIVERY_DATE_INVALID, isIsoDate } from "./delivery-date";
import { addDays } from "./quote";

/** Días que la fecha del proveedor queda antes de la de entrega, si no se indica. */
export const SUPPLIER_LEAD_DAYS = 3;

export const QUOTE_DELIVERY_DATE_REQUIRED = "Indica la fecha de entrega";
export const QUOTE_DELIVERY_DATE_PAST =
  "La fecha de entrega no puede ser anterior a hoy";
export const SUPPLIER_DATE_PAST =
  "La fecha del proveedor no puede ser anterior a hoy";
export const SUPPLIER_DATE_AFTER_DELIVERY =
  "La fecha del proveedor no puede ser posterior a la de entrega";

/** Fecha del proveedor por defecto: 3 días antes de la de entrega, sin pasar de hoy. */
export function defaultSupplierDeliveryDate(
  deliveryDate: string,
  today: string,
): string {
  const date = addDays(deliveryDate, -SUPPLIER_LEAD_DAYS);
  return date < today ? today : date;
}

/**
 * Error de las fechas (sin punto final) o null. `supplierDate` vacía: la de por defecto.
 * Las fechas que no cambian (`current`) pueden ya haber pasado.
 */
export function quoteDeliveryDatesError(
  deliveryDate: string,
  supplierDate: string,
  today: string,
  current: { deliveryDate: string | null; supplierDate: string | null } = {
    deliveryDate: null,
    supplierDate: null,
  },
): string | null {
  if (deliveryDate === "") return QUOTE_DELIVERY_DATE_REQUIRED;
  if (!isIsoDate(deliveryDate)) return DELIVERY_DATE_INVALID;
  if (deliveryDate !== current.deliveryDate && deliveryDate < today)
    return QUOTE_DELIVERY_DATE_PAST;
  if (supplierDate === "") return null;
  if (!isIsoDate(supplierDate)) return DELIVERY_DATE_INVALID;
  if (supplierDate !== current.supplierDate && supplierDate < today)
    return SUPPLIER_DATE_PAST;
  if (supplierDate > deliveryDate) return SUPPLIER_DATE_AFTER_DELIVERY;
  return null;
}
