import { csvMoney, limaDate, limaDateTime, toCsv } from "./restorations-csv";
import type { Cents } from "./money";
import { PIECE_STATUS_LABELS, type PieceStatus } from "./piece-state-machine";
import {
  PIECE_LOCATION_LABELS,
  type PieceLocation,
} from "./restoration-status";

/** Una pieza del CSV: lo que la vista de piezas muestra, según lo que el rol ve. */
export type CsvPiece = {
  restorationCode: string;
  code: string;
  /** Vacío si quien exporta no ve clientes (logística). */
  clientName: string;
  description: string;
  quantity: number;
  serviceName: string;
  materialName: string;
  measure: string;
  weightGrams: number | null;
  status: PieceStatus;
  location: PieceLocation;
  urgent: boolean;
  workshopName: string | null;
  /** Días en el taller (los que lleva, o los que estuvo). */
  workshopDays: number;
  estimatedDeliveryDate: string | null;
  workshopDeliveryDate: string | null;
  registeredAt: string | null;
  finishedAt: string | null;
  /** Null si aún no se define o si el rol no lo ve (ventas). */
  serviceCostCents: Cents | null;
  /** Null si está sin asignar o si el rol no lo ve (logística). */
  priceCents: Cents | null;
};

/**
 * CSV de la vista de piezas con los filtros de la URL, también las terminadas. Las
 * columnas de cliente, costo de servicio y precio de venta solo van si el rol las ve.
 * Montos en soles con punto decimal.
 */
export function piecesCsv(
  rows: readonly CsvPiece[],
  {
    showClient,
    showCost,
    showPrice,
  }: { showClient: boolean; showCost: boolean; showPrice: boolean },
): string {
  const columns: {
    header: string;
    show: boolean;
    value: (p: CsvPiece) => string | number | null;
  }[] = [
    { header: "Guía", show: true, value: (p) => p.restorationCode },
    { header: "Código", show: true, value: (p) => p.code },
    { header: "Cliente", show: showClient, value: (p) => p.clientName },
    { header: "Descripción", show: true, value: (p) => p.description },
    { header: "Cantidad", show: true, value: (p) => p.quantity },
    { header: "Servicio", show: true, value: (p) => p.serviceName },
    { header: "Material", show: true, value: (p) => p.materialName },
    { header: "Medida", show: true, value: (p) => p.measure },
    { header: "Peso (g)", show: true, value: (p) => p.weightGrams },
    {
      header: "Estado",
      show: true,
      value: (p) => PIECE_STATUS_LABELS[p.status],
    },
    {
      header: "Ubicación",
      show: true,
      value: (p) => PIECE_LOCATION_LABELS[p.location],
    },
    { header: "Urgente", show: true, value: (p) => (p.urgent ? "Sí" : "No") },
    { header: "Taller", show: true, value: (p) => p.workshopName },
    { header: "Días en taller", show: true, value: (p) => p.workshopDays },
    {
      header: "Entrega estimada",
      show: true,
      value: (p) => p.estimatedDeliveryDate,
    },
    {
      header: "Entrega del taller",
      show: true,
      value: (p) => p.workshopDeliveryDate,
    },
    {
      header: "Fecha de registro",
      show: true,
      value: (p) => (p.registeredAt ? limaDateTime(p.registeredAt) : ""),
    },
    {
      header: "Fecha de entrega o cierre",
      show: true,
      value: (p) => (p.finishedAt ? limaDate(p.finishedAt) : ""),
    },
    {
      header: "Costo de servicio",
      show: showCost,
      value: (p) => csvMoney(p.serviceCostCents),
    },
    {
      header: "Precio de venta",
      show: showPrice,
      value: (p) => csvMoney(p.priceCents),
    },
  ];
  const shown = columns.filter((c) => c.show);
  return toCsv(
    shown.map((c) => c.header),
    rows.map((r) => shown.map((c) => c.value(r))),
  );
}
