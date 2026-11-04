import type { Cents } from "./money";
import {
  PAYMENT_KIND_LABELS,
  paymentShopifyLabel,
  type PaymentKind,
  type PaymentShopifyState,
} from "./payments";
import { csvMoney, limaDateTime, toCsv } from "./restorations-csv";

/** Un pago o reembolso de la vista de pagos (y su fila del CSV). */
export type PaymentListRow = PaymentShopifyState & {
  id: string;
  restorationId: string;
  restorationCode: string;
  clientId: string;
  clientName: string;
  documentNumber: string | null;
  kind: PaymentKind;
  amountCents: Cents;
  methodName: string;
  branchName: string | null;
  /** Fecha del pago (AAAA-MM-DD). */
  paidOn: string;
  /** Motivo (reembolsos). */
  reason: string;
  createdByName: string | null;
  createdAt: string;
};

/**
 * CSV de los pagos con los filtros de la vista. "Monto" va siempre en positivo; "Neto"
 * resta los reembolsos, para sumar la columna en Excel.
 */
export function paymentsCsv(rows: readonly PaymentListRow[]): string {
  const header = [
    "Fecha de pago",
    "Restauración",
    "Cliente",
    "Documento",
    "Tipo",
    "Método",
    "Sucursal",
    "Monto",
    "Neto",
    "Motivo",
    "Origen",
    "Estado en Shopify",
    "Pedido de Shopify",
    "Registró",
    "Registrado el",
  ];
  return toCsv(
    header,
    rows.map((p) => [
      p.paidOn,
      p.restorationCode,
      p.clientName,
      p.documentNumber,
      PAYMENT_KIND_LABELS[p.kind],
      p.methodName,
      p.branchName,
      csvMoney(p.amountCents),
      csvMoney(p.kind === "reembolso" ? -p.amountCents : p.amountCents),
      p.reason,
      p.source === "shopify" ? "Shopify" : "Sistema",
      paymentShopifyLabel(p),
      p.orderName,
      p.createdByName,
      limaDateTime(p.createdAt),
    ]),
  );
}
