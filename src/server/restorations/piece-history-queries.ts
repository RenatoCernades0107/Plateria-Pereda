import "server-only";

import { toCents, type Cents } from "@/domain/money";
import {
  listPiecesHistoryArgs,
  PIECES_HISTORY_PAGE_SIZE,
  type PieceHistoryFilters,
} from "@/domain/piece-history-filters";
import { toPieceStatus, type PieceStatus } from "@/domain/piece-state-machine";
import type { PieceLocation } from "@/domain/restoration-status";
import { createClient } from "@/lib/supabase/server";
import { signedPhotoUrls } from "@/server/files/queries";

export type HistoryPiece = {
  id: string;
  code: string;
  restorationId: string;
  restorationCode: string;
  /** Vacío si quien mira no ve clientes (logística). */
  clientName: string;
  description: string;
  /** Cantidad (el precio es por unidad). */
  quantity: number;
  status: PieceStatus;
  location: PieceLocation;
  urgent: boolean;
  workshopId: string | null;
  workshopName: string | null;
  /** Cuándo se entregó, devolvió o anuló. */
  finishedAt: string;
  serviceName: string;
  materialName: string;
  measure: string;
  weightGrams: number | null;
  /** Null si aún no se definió o si el rol no lo ve (ventas). */
  serviceCostCents: Cents | null;
  /** Null si está sin asignar o si el rol no lo ve (logística). */
  priceCents: Cents | null;
  /** Primera foto "Antes" de la pieza (URL firmada de corta duración). */
  photoUrl: string | null;
};

const centsOrNull = (value: number | null) =>
  value === null ? null : toCents(Number(value));

/**
 * Historial de piezas terminadas (`list_pieces_history`): mismas reglas de visibilidad
 * y de montos que la vista de piezas (logística no ve restauraciones pasadas, D24).
 */
export async function listPiecesHistory(
  filters: PieceHistoryFilters,
  { withClient }: { withClient: boolean },
): Promise<{ items: HistoryPiece[]; total: number; pages: number }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "list_pieces_history",
    listPiecesHistoryArgs(filters),
  );
  if (error) throw error;
  const total = Number(data[0]?.total_count ?? 0);
  const photos = await signedPhotoUrls(
    data.flatMap((p) => (p.photo_path ? [p.photo_path] : [])),
  );
  return {
    total,
    pages: Math.max(1, Math.ceil(total / PIECES_HISTORY_PAGE_SIZE)),
    items: data.map((p) => ({
      id: p.id,
      code: p.code,
      restorationId: p.restoration_id,
      restorationCode: p.restoration_code,
      clientName: withClient ? (p.client_name ?? "") : "",
      description: p.description,
      quantity: p.quantity ?? 1,
      status: toPieceStatus(p.status),
      location: p.location,
      urgent: p.urgent,
      workshopId: p.workshop_id,
      workshopName: p.workshop_name,
      finishedAt: p.finished_at,
      serviceName: p.service_name,
      materialName: p.material_name,
      measure: p.measure,
      weightGrams: p.weight_grams,
      serviceCostCents: centsOrNull(p.service_cost),
      priceCents: centsOrNull(p.price),
      photoUrl: p.photo_path ? (photos.get(p.photo_path) ?? null) : null,
    })),
  };
}
