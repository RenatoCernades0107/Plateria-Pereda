import "server-only";

import type { PieceStatus } from "@/domain/piece-state-machine";
import { createClient } from "@/lib/supabase/server";

/** Estados desde los que una pieza se puede entregar. */
const DELIVERABLE_FROM: readonly PieceStatus[] = ["aprobada", "observada"];

/**
 * Restauraciones de la vista de piezas a las que les falta cobrar el saldo (P45), para
 * que "Entregar" desde la fila pida confirmarlo. Solo consulta las de piezas que se
 * pueden entregar, en una sola llamada. La BD lo exige igual al entregar.
 */
export async function boardBalanceDue(
  pieces: readonly { restorationId: string; status: PieceStatus }[],
): Promise<string[]> {
  const ids = [
    ...new Set(
      pieces
        .filter((p) => DELIVERABLE_FROM.includes(p.status))
        .map((p) => p.restorationId),
    ),
  ];
  if (ids.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("restorations_balance_due", {
    p_restoration_ids: ids,
  });
  if (error) throw error;
  return data.filter((r) => r.balance_due).map((r) => r.restoration_id);
}
