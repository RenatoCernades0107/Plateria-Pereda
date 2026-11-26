import { formatDate } from "@/lib/format";

import { formatCents, sumCents, type Cents } from "./money";
import {
  PIECE_DATE_FIELD_LABELS,
  type PieceDateField,
} from "./piece-board-filters";
import { PIECE_STATUS_LABELS, type PieceStatus } from "./piece-state-machine";

/**
 * Liquidación de servicios por proveedor: las piezas elegidas en la vista de piezas con
 * el taller que hizo cada una y su costo de servicio, más el total, para calcular lo que
 * se le paga al proveedor. Lleva el filtro de fecha aplicado (si lo hay).
 * El dibujo con jsPDF está en `components/restorations/settlement-report-draw.ts`.
 */

export type SettlementReportPiece = {
  id: string;
  /** Pieza con su guía, p. ej. `RES-00004-1`. */
  code: string;
  quantity: number;
  status: PieceStatus;
  description: string;
  serviceName: string;
  /** Taller (proveedor); null si la pieza no tiene. */
  workshopName: string | null;
  /** Lo que cobra el taller; null si aún no se define. */
  serviceCostCents: Cents | null;
};

export type SettlementDateFilter = {
  from: string | null;
  to: string | null;
  dateField: PieceDateField;
};

export type SettlementReportRow = {
  number: number;
  code: string;
  quantity: string;
  description: string;
  service: string;
  provider: string;
  status: string;
  /** Costo de servicio; `—` si aún no se define. */
  serviceCost: string;
};

export type SettlementReportModel = {
  title: string;
  printedAt: string;
  generatedBy: string | null;
  /** Filtro de fecha aplicado, p. ej. `Fecha de registro: 01/10/2026 al 31/10/2026`; null si no hay. */
  dateFilter: string | null;
  /** Suma de los costos de servicio definidos de las piezas del reporte. */
  totalServiceCost: string;
  /** Piezas sin costo definido (no suman al total). */
  withoutCost: number;
  rows: SettlementReportRow[];
};

/** Nombre del archivo, p. ej. `liquidacion-proveedor-2026-10-15.pdf` (fecha de Lima). */
export function settlementReportFileName(now = new Date()): string {
  const [day, month, year] = formatDate(now).split("/");
  return `liquidacion-proveedor-${year}-${month}-${day}.pdf`;
}

/** `AAAA-MM-DD` → `DD/MM/AAAA`. */
function isoToDisplay(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function settlementDateFilterLabel(
  filter: SettlementDateFilter | null | undefined,
): string | null {
  if (!filter || (!filter.from && !filter.to)) return null;
  const field = PIECE_DATE_FIELD_LABELS[filter.dateField];
  const range =
    filter.from && filter.to
      ? `${isoToDisplay(filter.from)} al ${isoToDisplay(filter.to)}`
      : filter.from
        ? `desde ${isoToDisplay(filter.from)}`
        : `hasta ${isoToDisplay(filter.to!)}`;
  return `${field}: ${range}`;
}

export function settlementReportModel(
  pieces: readonly SettlementReportPiece[],
  {
    generatedBy = null,
    now = new Date(),
    dateFilter = null,
  }: {
    generatedBy?: string | null;
    now?: Date;
    dateFilter?: SettlementDateFilter | null;
  } = {},
): SettlementReportModel {
  return {
    title: "LIQUIDACIÓN DE SERVICIOS POR PROVEEDOR",
    printedAt: formatDate(now),
    generatedBy: generatedBy?.trim() || null,
    dateFilter: settlementDateFilterLabel(dateFilter),
    totalServiceCost: formatCents(
      sumCents(pieces.flatMap((p) => p.serviceCostCents ?? [])),
    ),
    withoutCost: pieces.filter((p) => p.serviceCostCents === null).length,
    rows: pieces.map((p, i) => ({
      number: i + 1,
      code: p.code,
      quantity: String(p.quantity),
      description: p.description.trim() || "—",
      service: p.serviceName.trim() || "—",
      provider: p.workshopName?.trim() || "Sin proveedor",
      status: PIECE_STATUS_LABELS[p.status],
      serviceCost:
        p.serviceCostCents === null ? "—" : formatCents(p.serviceCostCents),
    })),
  };
}
