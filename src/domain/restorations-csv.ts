import { DOCUMENT_LABELS, type DocumentType } from "./documents";
import {
  PAYMENT_STATUS_LABELS,
  PAYMENT_TYPE_LABELS,
  toDecimalString,
  type Cents,
  type PaymentStatus,
  type PaymentType,
} from "./money";
import {
  RESTORATION_KIND_LABELS,
  RESTORATION_ORIGIN_LABELS,
  RESTORATION_STATUS_LABELS,
  type RestorationKind,
  type RestorationOrigin,
  type RestorationStatus,
} from "./restoration-status";

/** Una restauración del CSV: todos sus datos, con los del cliente y sus pagos. */
export type CsvRestoration = {
  code: string;
  createdAt: string;
  clientName: string;
  documentType: DocumentType | null;
  documentNumber: string | null;
  clientPhone: string | null;
  clientEmail: string | null;
  contactName: string | null;
  contactPhone: string | null;
  status: RestorationStatus;
  /** Terminada (anulada, rechazada o completada desde antes de hoy). */
  archived: boolean;
  /** Cuándo terminó (última entrega, devolución o anulación); null si sigue vigente. */
  finishedAt: string | null;
  kind: RestorationKind;
  origin: RestorationOrigin;
  piecesCount: number;
  /** Piezas en Espera respuesta cliente. */
  waitingCount: number;
  /** Talleres de sus piezas, separados por comas. */
  workshopNames: string | null;
  paymentType: PaymentType;
  paymentStatus: PaymentStatus | null;
  totalCents: Cents | null;
  expectedDepositCents: Cents | null;
  depositPercent: number | null;
  /** Pagado neto (pagos − reembolsos). */
  paidCents: Cents | null;
  refundedCents: Cents | null;
  balanceCents: Cents | null;
  /** Fecha del último pago (AAAA-MM-DD). */
  lastPaidOn: string | null;
  shopifyOrderName: string | null;
  createdByName: string | null;
  notes: string;
};

/** Escapa un campo CSV (comillas, comas y saltos de línea). */
export function csvField(value: string | number | null): string {
  const text = value === null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Arma el CSV: con BOM para que Excel lea las tildes y líneas CRLF. */
export function toCsv(
  header: readonly string[],
  rows: readonly (readonly (string | number | null)[])[],
): string {
  const lines = rows.map((row) => row.map(csvField).join(","));
  return `﻿${[header.map(csvField).join(","), ...lines].join("\r\n")}\r\n`;
}

export const csvMoney = (cents: Cents | null) =>
  cents === null ? "" : toDecimalString(cents);

const limaFormat = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", ...options });

const DATE = limaFormat({ year: "numeric", month: "2-digit", day: "2-digit" });
const TIME = limaFormat({ hour: "2-digit", minute: "2-digit", hour12: false });

/** Fecha en Lima ("AAAA-MM-DD"). */
export const limaDate = (iso: string) => DATE.format(new Date(iso));

/** Fecha y hora en Lima ("AAAA-MM-DD HH:MM"). */
export const limaDateTime = (iso: string) =>
  `${limaDate(iso)} ${TIME.format(new Date(iso))}`;

/**
 * CSV del listado (P33 con su propuesta), con todas las restauraciones de los filtros
 * (también las terminadas) y todos sus datos. Montos en soles con punto decimal.
 */
export function restorationsCsv(rows: readonly CsvRestoration[]): string {
  const header = [
    "Código",
    "Fecha de registro",
    "Cliente",
    "Tipo de documento",
    "Documento",
    "Teléfono",
    "Email",
    "Contacto",
    "Teléfono del contacto",
    "Estado",
    "Terminada",
    "Fecha de cierre",
    "Tipo de guía",
    "Origen",
    "Piezas",
    "Piezas en espera del cliente",
    "Talleres",
    "Tipo de pago",
    "Estado de pago",
    "Total",
    "Adelanto esperado",
    "% de adelanto",
    "Pagado",
    "Reembolsado",
    "Saldo",
    "Último pago",
    "Pedido de Shopify",
    "Registrada por",
    "Notas",
  ];
  return toCsv(
    header,
    rows.map((r) => [
      r.code,
      limaDateTime(r.createdAt),
      r.clientName,
      r.documentType ? DOCUMENT_LABELS[r.documentType] : "",
      r.documentNumber,
      r.clientPhone,
      r.clientEmail,
      r.contactName,
      r.contactPhone,
      RESTORATION_STATUS_LABELS[r.status],
      r.archived ? "Sí" : "No",
      r.finishedAt ? limaDate(r.finishedAt) : "",
      RESTORATION_KIND_LABELS[r.kind],
      RESTORATION_ORIGIN_LABELS[r.origin],
      r.piecesCount,
      r.waitingCount,
      r.workshopNames,
      PAYMENT_TYPE_LABELS[r.paymentType],
      r.paymentStatus ? PAYMENT_STATUS_LABELS[r.paymentStatus] : "",
      csvMoney(r.totalCents),
      csvMoney(r.expectedDepositCents),
      r.depositPercent,
      csvMoney(r.paidCents),
      csvMoney(r.refundedCents),
      csvMoney(r.balanceCents),
      r.lastPaidOn,
      r.shopifyOrderName,
      r.createdByName,
      r.notes,
    ]),
  );
}
