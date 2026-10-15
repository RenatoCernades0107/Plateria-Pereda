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
  /** Número de la guía, p. ej. `RES-00004`. */
  guideCode: string;
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
  number: number;
  /** Número de guía. */
  guide: string;
  code: string;
  status: string;
  description: string;
  /** Material, medidas y peso, en una línea. */
  detail: string;
  service: string;
  /** "Servicio a realizar" (las notas de la pieza); vacío si no hay. */
  task: string;
};

export type ProviderReportModel = {
  title: string;
  /** Fecha de impresión del reporte. */
  printedAt: string;
  /** Quien genera el reporte (va discreto en el pie); null si no se conoce. */
  generatedBy: string | null;
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
  }: { generatedBy?: string | null; now?: Date } = {},
): ProviderReportModel {
  return {
    title: "REPORTE PARA PROVEEDOR",
    printedAt: formatDate(now),
    generatedBy: generatedBy?.trim() || null,
    rows: pieces.map((p, i) => ({
      id: p.id,
      number: i + 1,
      guide: p.guideCode,
      code: p.code,
      status: PIECE_STATUS_LABELS[p.status],
      description: p.description.trim() || "—",
      detail: [
        p.materialName,
        p.measure,
        p.weightGrams === null ? "" : `${p.weightGrams} g`,
      ]
        .map((part) => part.trim())
        .filter(Boolean)
        .join(" · "),
      service: p.serviceName.trim() || "—",
      task: p.notes.trim(),
    })),
  };
}
