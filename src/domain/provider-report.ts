import { formatDate } from "@/lib/format";

import { PIECE_STATUS_LABELS, type PieceStatus } from "./piece-state-machine";

/**
 * Reporte para el proveedor (taller) de las piezas elegidas en la vista de piezas:
 * toda la información de cada pieza, sin precios ni costos y sin datos del cliente.
 * Aquí se arma el contenido; el dibujo con jsPDF está en
 * `components/restorations/provider-report-draw.ts`.
 */

export type ProviderReportPiece = {
  id: string;
  /** Pieza con su guía, p. ej. `RES-00004-1`. */
  code: string;
  status: PieceStatus;
  description: string;
  /** Notas de la pieza: lo que se pide hacer (se muestra como "Servicio a realizar"). */
  notes: string;
  serviceName: string;
  materialName: string;
  measure: string;
  weightGrams: number | null;
};

export type ProviderReportRow = {
  id: string;
  code: string;
  status: string;
  description: string;
  /** "Servicio a realizar" (las notas de la pieza). */
  task: string;
  service: string;
  material: string;
  measure: string;
  weight: string;
};

export type ProviderReportModel = {
  title: string;
  /** Fecha de impresión del reporte. */
  printedAt: string;
  rows: ProviderReportRow[];
};

const orDash = (value: string) => value.trim() || "—";

/** Nombre del archivo, p. ej. `reporte-proveedor-2026-10-15.pdf` (fecha de Lima). */
export function providerReportFileName(now = new Date()): string {
  const [day, month, year] = formatDate(now).split("/");
  return `reporte-proveedor-${year}-${month}-${day}.pdf`;
}

export function providerReportModel(
  pieces: readonly ProviderReportPiece[],
  now = new Date(),
): ProviderReportModel {
  return {
    title: "REPORTE PARA PROVEEDOR",
    printedAt: formatDate(now),
    rows: pieces.map((p) => ({
      id: p.id,
      code: p.code,
      status: PIECE_STATUS_LABELS[p.status],
      description: orDash(p.description),
      task: p.notes.trim(),
      service: orDash(p.serviceName),
      material: orDash(p.materialName),
      measure: orDash(p.measure),
      weight: p.weightGrams === null ? "—" : `${p.weightGrams} g`,
    })),
  };
}
