import {
  PAYMENT_STATUS_LABELS,
  PAYMENT_TYPE_LABELS,
  toDecimalString,
  type Cents,
  type PaymentStatus,
  type PaymentType,
} from "./money";
import {
  RESTORATION_STATUS_LABELS,
  type RestorationStatus,
} from "./restoration-status";

export type CsvRestoration = {
  code: string;
  clientName: string;
  documentNumber: string | null;
  contactName: string | null;
  status: RestorationStatus;
  paymentStatus: PaymentStatus | null;
  paymentType: PaymentType;
  piecesCount: number;
  totalCents: Cents | null;
  paidCents: Cents | null;
  balanceCents: Cents | null;
  createdAt: string;
};

/** Escapa un campo CSV (comillas, comas y saltos de línea). */
function field(value: string | number | null): string {
  const text = value === null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const money = (cents: Cents | null) =>
  cents === null ? "" : toDecimalString(cents);

/** Fecha de registro en Lima ("AAAA-MM-DD"). */
const limaDate = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));

/**
 * CSV del listado (P33 con su propuesta). Con BOM para que Excel lea las tildes, y
 * los montos en soles con punto decimal.
 */
export function restorationsCsv(rows: readonly CsvRestoration[]): string {
  const header = [
    "Código",
    "Fecha",
    "Cliente",
    "Documento",
    "Contacto",
    "Estado",
    "Estado de pago",
    "Tipo de pago",
    "Piezas",
    "Total",
    "Pagado",
    "Saldo",
  ];
  const lines = rows.map((r) =>
    [
      r.code,
      limaDate(r.createdAt),
      r.clientName,
      r.documentNumber,
      r.contactName,
      RESTORATION_STATUS_LABELS[r.status],
      r.paymentStatus ? PAYMENT_STATUS_LABELS[r.paymentStatus] : "",
      PAYMENT_TYPE_LABELS[r.paymentType],
      r.piecesCount,
      money(r.totalCents),
      money(r.paidCents),
      money(r.balanceCents),
    ]
      .map(field)
      .join(","),
  );
  return `﻿${[header.join(","), ...lines].join("\r\n")}\r\n`;
}
