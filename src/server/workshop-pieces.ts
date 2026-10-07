import "server-only";

import { toCents, type Cents } from "@/domain/money";
import type { PieceStatus } from "@/domain/piece-state-machine";
import {
  WORKSHOP_PIECES_ALL_LIMIT,
  WORKSHOP_PIECES_PAGE_SIZE,
  workshopPiecesArgs,
  type WorkshopPiecesView,
} from "@/domain/workshop-pieces";
import { createClient } from "@/lib/supabase/server";

export type WorkshopPiece = {
  id: string;
  restorationId: string;
  restorationCode: string;
  status: PieceStatus;
  code: string;
  description: string;
  serviceName: string;
  measure: string;
  materialName: string;
  weightGrams: number | null;
  /** null = el taller aún no pasa el costo. */
  serviceCostCents: Cents | null;
};

export type WorkshopPiecesPage = {
  items: WorkshopPiece[];
  total: number;
  pages: number;
  /** Suma del costo de servicio de todas las piezas del taller (no solo de la página). */
  totalCostCents: Cents;
};

/** Piezas del taller que aún no volvieron al cliente (RPC `list_workshop_pieces`). */
export async function listWorkshopPieces(
  workshopId: string,
  view: WorkshopPiecesView,
): Promise<WorkshopPiecesPage> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "list_workshop_pieces",
    workshopPiecesArgs(workshopId, view),
  );
  if (error) throw error;
  const total = Number(data[0]?.total_count ?? 0);
  const size = view.all ? WORKSHOP_PIECES_ALL_LIMIT : WORKSHOP_PIECES_PAGE_SIZE;
  return {
    total,
    pages: Math.max(1, Math.ceil(total / size)),
    totalCostCents: toCents(Number(data[0]?.total_cost ?? 0)),
    items: data.map((p) => ({
      id: p.id,
      restorationId: p.restoration_id,
      restorationCode: p.restoration_code,
      status: p.status,
      code: p.code,
      description: p.description,
      serviceName: p.service_name,
      measure: p.measure,
      materialName: p.material_name,
      weightGrams: p.weight_grams === null ? null : Number(p.weight_grams),
      serviceCostCents:
        p.service_cost === null ? null : toCents(Number(p.service_cost)),
    })),
  };
}
