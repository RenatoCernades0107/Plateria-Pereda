import "server-only";

import {
  requirementsError,
  REQUIRED_FIELDS,
  type RequirementStep,
} from "@/domain/piece-requirements";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Valida los campos obligatorios del paso (K10) antes de llamar a la BD. Devuelve el
 * mensaje de lo que falta, o null si se puede seguir.
 */
export async function checkRequirements(
  supabase: Supabase,
  step: RequirementStep,
  pieceIds: string[],
  workshopId: string | null = null,
): Promise<string | null> {
  if (!REQUIRED_FIELDS[step]?.length || pieceIds.length === 0) return null;
  const { data, error } = await supabase.rpc("piece_requirement_facts", {
    p_piece_ids: pieceIds,
  });
  if (error)
    return "No se pudieron revisar los datos obligatorios de la pieza.";
  return requirementsError(
    step,
    data.map((f) => ({
      code: f.code,
      hasPrice: f.has_price,
      hasServiceCost: f.has_service_cost,
      workshopId: f.workshop_id,
      hasAfterPhoto: f.has_after_photo,
    })),
    workshopId,
  );
}
