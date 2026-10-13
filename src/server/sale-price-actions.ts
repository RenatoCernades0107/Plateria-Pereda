"use server";

import { revalidatePath } from "next/cache";

import { parseMoney, toDecimalString } from "@/domain/money";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/server/auth";
import { scheduleShopifySync } from "@/server/shopify-sync/run";

export type SalePriceResult = { ok: true } | { error: string };

/**
 * Fija el precio de venta de una pieza desde la vista de piezas (P55). Solo el admin
 * (D58); texto vacío lo deja sin asignar. Con la orden de Shopify creada, un precio ya
 * asignado se cambia con "Cambiar precio" (con motivo): lo exige la BD.
 */
export async function setPieceSalePrice(
  pieceId: string,
  input: string,
): Promise<SalePriceResult> {
  await requirePermission("piezas.precio-venta");
  const text = input.trim();
  let price: number | null = null;
  if (text !== "") {
    const cents = parseMoney(text);
    if (cents === null) {
      return { error: "Ingresa un monto válido (hasta 2 decimales)." };
    }
    price = Number(toDecimalString(cents));
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pieces")
    .update({ price })
    .eq("id", pieceId)
    .select("restoration_id");
  if (error) {
    return {
      error:
        error.code === "23514" || error.code === "42501"
          ? error.message
          : "No se pudo guardar el precio de venta.",
    };
  }
  if (data.length === 0) return { error: "La pieza no existe." };
  // Asignar el último precio encola la orden de Shopify, o agrega la pieza a la orden.
  scheduleShopifySync();
  revalidatePath("/piezas");
  revalidatePath("/piezas/[id]", "page");
  revalidatePath(`/restauraciones/${data[0]!.restoration_id}`);
  return { ok: true };
}
