import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

/** Aviso cuando la restauración se registró pero su adelanto no. */
export const DEPOSIT_NOT_RECORDED =
  "La restauración se registró, pero no se pudo registrar el adelanto. Regístralo desde Pagos.";

/**
 * Registra el adelanto ("A cuenta") con que se registró la restauración como un pago
 * real, en la misma tabla que "Registrar pago" (Paso 11.2): así cuenta en lo pagado,
 * el estado de pago y la pestaña Pagos. El monto es el adelanto esperado que calcula
 * la BD (total con IGV × %); la BD valida el saldo, recalcula y, si ya hay orden de
 * Shopify, encola su conciliación. Sin adelanto (0) no registra nada.
 *
 * Devuelve true si quedó registrado (o no había nada que registrar).
 */
export async function recordInitialDeposit(
  supabase: SupabaseClient<Database>,
  restorationId: string,
  methodId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("restorations")
    .select("expected_deposit")
    .eq("id", restorationId)
    .maybeSingle();
  if (error || !data) return false;
  const amount = Number(data.expected_deposit ?? 0);
  if (!(amount > 0)) return true;
  const { error: payError } = await supabase.from("payments").insert({
    restoration_id: restorationId,
    amount,
    payment_method_id: methodId,
    // La BD lo reemplaza por el nombre del método elegido.
    method_name: "-",
  });
  return !payError;
}
