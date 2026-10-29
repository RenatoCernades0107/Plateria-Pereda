"use server";

import { createClient } from "@/lib/supabase/server";
import { INVALID_ARGS, idsArg, validArgs } from "@/lib/validation/action-args";
import { requirePermission } from "@/server/auth";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PIECES = 200;

/**
 * Datos del reporte del proveedor que la vista de piezas no trae: las notas de las
 * piezas elegidas (id → nota) y el nombre de quien lo genera. Se leen de `pieces_operational`, sin dinero y con la misma
 * visibilidad por rol que el resto de las vistas.
 */
export async function getProviderReportData(
  pieceIds: string[],
): Promise<
  { notes: Record<string, string>; generatedBy: string } | { error: string }
> {
  const user = await requirePermission("restauraciones.ver");
  if (!validArgs([idsArg], [pieceIds])) return { error: INVALID_ARGS };
  const ids = [...new Set(pieceIds)];
  if (
    ids.length === 0 ||
    ids.length > MAX_PIECES ||
    !ids.every((id) => UUID.test(id))
  )
    return { error: "Las piezas elegidas no son válidas." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pieces_operational")
    .select("id, notes")
    .in("id", ids);
  if (error) return { error: "No se pudieron leer las notas de las piezas." };
  return {
    notes: Object.fromEntries(data.map((p) => [p.id!, p.notes ?? ""])),
    generatedBy: user.fullName,
  };
}
