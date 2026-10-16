import "server-only";

import {
  requirementsError,
  REQUIRED_FIELDS,
  type RequirementStep,
} from "@/domain/piece-requirements";
import type { RestorationKind } from "@/domain/restoration-status";
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
  // El precio solo se exige en las guías que se cobran (normales).
  const kinds = REQUIRED_FIELDS[step]?.includes("precio")
    ? await restorationKinds(supabase, pieceIds)
    : new Map<string, RestorationKind>();
  if (!kinds)
    return "No se pudieron revisar los datos obligatorios de la pieza.";
  return requirementsError(
    step,
    data.map((f) => ({
      code: f.code,
      hasPrice: f.has_price,
      hasServiceCost: f.has_service_cost,
      workshopId: f.workshop_id,
      hasAfterPhoto: f.has_after_photo,
      restorationKind: kinds.get(f.piece_id) ?? "normal",
    })),
    workshopId,
  );
}

/** Tipo de guía de cada pieza (`piece_requirement_facts` no lo trae); null si falla. */
async function restorationKinds(
  supabase: Supabase,
  pieceIds: string[],
): Promise<Map<string, RestorationKind> | null> {
  const { data: pieces, error } = await supabase
    .from("pieces_operational")
    .select("id, restoration_id")
    .in("id", pieceIds);
  if (error) return null;
  const restorationIds = [
    ...new Set(pieces.map((p) => p.restoration_id).filter((id) => id !== null)),
  ];
  if (restorationIds.length === 0) return new Map();
  const { data: restorations, error: restorationsError } = await supabase
    .from("restorations_operational")
    .select("id, kind")
    .in("id", restorationIds);
  if (restorationsError) return null;
  const kindOf = new Map(restorations.map((r) => [r.id, r.kind]));
  return new Map(
    pieces.map((p) => [p.id!, kindOf.get(p.restoration_id) ?? "normal"]),
  );
}
