import { formatDate } from "@/lib/format";

import { formatDeliveryDate } from "./delivery-date";
import { formatCents, sumCents, type Cents } from "./money";
import { PIECE_STATUS_LABELS, type PieceStatus } from "./piece-state-machine";
import {
  PIECE_LOCATION_LABELS,
  type PieceLocation,
} from "./restoration-status";

/**
 * Reporte para el proveedor (taller) de las piezas elegidas en la vista de piezas:
 * toda la información de cada pieza (medidas, peso y, para quien lo ve, el costo de
 * servicio), sin precio de venta y sin datos del cliente. No repite el número de guía:
 * ya va en el código de la pieza.
 * Aquí se arma el contenido; el dibujo con jsPDF está en
 * `components/restorations/provider-report-draw.ts`.
 */

export type ProviderReportPiece = {
  id: string;
  /** Pieza con su guía, p. ej. `RES-00004-1`. */
  code: string;
  /** Unidades de la pieza (p. ej. 6 cucharitas). */
  quantity: number;
  status: PieceStatus;
  location: PieceLocation;
  description: string;
  /** Notas de la pieza: lo que se pide hacer (se muestra como "Servicio a realizar"). */
  notes: string;
  serviceName: string;
  materialName: string;
  measure: string;
  weightGrams: number | null;
  /** Lo que cobra el taller; null si aún no se define o si el rol no lo ve. */
  serviceCostCents: Cents | null;
  /** Fecha estimada de entrega del taller (AAAA-MM-DD); null si no se indicó. */
  workshopDeliveryDate: string | null;
};

export type ProviderReportRow = {
  id: string;
  number: number;
  code: string;
  quantity: string;
  status: string;
  location: string;
  description: string;
  /** Material; vacío si no hay. */
  detail: string;
  measure: string;
  /** Peso en gramos, p. ej. `120 g`. */
  weight: string;
  service: string;
  /** Costo de servicio (solo si el reporte lo lleva). */
  serviceCost: string;
  /** "Servicio a realizar" (las notas de la pieza); vacío si no hay. */
  task: string;
  /** Fecha estimada de entrega del taller (p. ej. `30 oct`); `—` si no se indicó. */
  workshopDeliveryDate: string;
};

export type ProviderReportModel = {
  title: string;
  /** Fecha de impresión del reporte. */
  printedAt: string;
  /** Quien genera el reporte (va discreto en el pie); null si no se conoce. */
  generatedBy: string | null;
  /** Lleva la columna de costo de servicio y su total (admin y logística). */
  showServiceCost: boolean;
  /** Suma de los costos definidos de las piezas del reporte. */
  totalServiceCost: string;
  rows: ProviderReportRow[];
};

/** Nombre del archivo, p. ej. `reporte-proveedor-2026-10-15.pdf` (fecha de Lima). */
export function providerReportFileName(now = new Date()): string {
  const [day, month, year] = formatDate(now).split("/");
  return `reporte-proveedor-${year}-${month}-${day}.pdf`;
}

export function providerReportModel(
  pieces: readonly ProviderReportPiece[],
  {
    generatedBy = null,
    now = new Date(),
    showServiceCost = false,
  }: {
    generatedBy?: string | null;
    now?: Date;
    showServiceCost?: boolean;
  } = {},
): ProviderReportModel {
  return {
    title: "REPORTE PARA PROVEEDOR",
    printedAt: formatDate(now),
    generatedBy: generatedBy?.trim() || null,
    showServiceCost,
    totalServiceCost: formatCents(
      sumCents(pieces.flatMap((p) => p.serviceCostCents ?? [])),
    ),
    rows: pieces.map((p, i) => ({
      id: p.id,
      number: i + 1,
      code: p.code,
      quantity: String(p.quantity),
      status: PIECE_STATUS_LABELS[p.status],
      location: PIECE_LOCATION_LABELS[p.location],
      description: p.description.trim() || "—",
      detail: p.materialName.trim(),
      measure: p.measure.trim() || "—",
      weight: p.weightGrams === null ? "—" : `${p.weightGrams} g`,
      service: p.serviceName.trim() || "—",
      serviceCost:
        p.serviceCostCents === null ? "—" : formatCents(p.serviceCostCents),
      task: p.notes.trim(),
      workshopDeliveryDate: p.workshopDeliveryDate
        ? formatDeliveryDate(p.workshopDeliveryDate, now)
        : "—",
    })),
  };
}
