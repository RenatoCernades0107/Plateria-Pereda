"use server";

import { revalidatePath } from "next/cache";

import { parseMoney, toDecimalString } from "@/domain/money";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/server/auth";

export type ServiceCostResult = { ok: true } | { error: string };

/**
 * Fija el costo de servicio de una pieza (lo que cobra el taller). Texto vacío lo
 * deja sin definir. Solo admin y logística; la BD lo exige igual (RPC).
 */
export async function setPieceServiceCost(
  pieceId: string,
  input: string,
): Promise<ServiceCostResult> {
  await requirePermission("piezas.costo-servicio");
  const text = input.trim();
  let cost: number | null = null;
  if (text !== "") {
    const cents = parseMoney(text);
    if (cents === null) {
      return { error: "Ingresa un monto válido (hasta 2 decimales)." };
    }
    cost = Number(toDecimalString(cents));
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_piece_service_cost", {
    p_piece_id: pieceId,
    p_cost: cost,
  });
  if (error) {
    return {
      error:
        error.code === "23514" || error.code === "42501"
          ? error.message
          : "No se pudo guardar el costo de servicio.",
    };
  }
  revalidatePath("/talleres/[id]/piezas", "page");
  return { ok: true };
}
