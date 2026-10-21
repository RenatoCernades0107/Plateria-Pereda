"use server";

import { revalidatePath } from "next/cache";

import { parseMoney, toDecimalString } from "@/domain/money";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/server/auth";
import { scheduleShopifySync } from "@/server/shopify-sync/run";

export type SalePriceResult = { ok: true } | { error: string };

/** Las reglas de la BD ya traen mensajes en español para estos códigos. */
const READABLE = new Set(["23514", "42501", "23503", "22023"]);

/**
 * Fija el precio de venta de una pieza desde la vista de piezas (P55). Admin (D58) y
 * logística (2026-10-19), por la RPC `set_piece_sale_price` (logística no edita la
 * tabla); texto vacío lo deja sin asignar. Con la orden de Shopify creada, un precio ya
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
  const { data: restorationId, error } = await supabase.rpc(
    "set_piece_sale_price",
    {
      p_piece_id: pieceId,
      // El tipo generado no admite null, pero la función sí (deja el precio sin asignar).
      p_price: price as number,
    },
  );
  if (error) {
    return {
      error:
        READABLE.has(error.code ?? "") && error.message
          ? error.message
          : "No se pudo guardar el precio de venta.",
    };
  }
  // Asignar el último precio encola la orden de Shopify, o agrega la pieza a la orden.
  scheduleShopifySync();
  revalidatePath("/piezas");
  revalidatePath("/piezas/[id]", "page");
  if (restorationId) revalidatePath(`/restauraciones/${restorationId}`);
  return { ok: true };
}
