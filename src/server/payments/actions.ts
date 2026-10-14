"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { MAX_CENTS, toDecimalString } from "@/domain/money";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/server/auth";
import { checkRequirements } from "@/server/restorations/requirements";
import { scheduleShopifySync } from "@/server/shopify-sync/run";

export type PaymentActionResult = { ok: true } | { error: string };

const READABLE = new Set(["23514", "42501", "23503", "22023"]);
const fail = (
  error: { code?: string; message?: string },
  fallback: string,
): PaymentActionResult => ({
  error:
    READABLE.has(error.code ?? "") && error.message ? error.message : fallback,
});

const cents = z.number().int().positive().max(MAX_CENTS);
const date = z.iso.date();

const paymentSchema = z.object({
  paidOn: date,
  rows: z
    .array(z.object({ methodId: z.guid(), amountCents: cents }))
    .min(1)
    .max(5),
});
export type PaymentInput = z.input<typeof paymentSchema>;

function refresh(restorationId: string) {
  revalidatePath(`/restauraciones/${restorationId}`);
  revalidatePath("/restauraciones");
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Inserta los pagos (uno por método); la BD valida el saldo y recalcula. */
async function insertPayments(
  supabase: Supabase,
  restorationId: string,
  input: z.output<typeof paymentSchema>,
) {
  return supabase.from("payments").insert(
    input.rows.map((row) => ({
      restoration_id: restorationId,
      amount: Number(toDecimalString(row.amountCents)),
      payment_method_id: row.methodId,
      // La BD lo reemplaza por el nombre del método elegido.
      method_name: "-",
      paid_on: input.paidOn,
    })),
  );
}

/**
 * Registra un pago, repartido en uno o más métodos (Paso 11.2). Con la orden de
 * Shopify creada, la BD encola su conciliación (`payment.sync`).
 */
export async function registerPayment(
  restorationId: string,
  input: PaymentInput,
): Promise<PaymentActionResult> {
  await requirePermission("pagos.registrar");
  const parsed = paymentSchema.safeParse(input);
  if (!parsed.success || !z.guid().safeParse(restorationId).success)
    return { error: "Revisa el monto, el método y la fecha." };
  const supabase = await createClient();
  const { error } = await insertPayments(supabase, restorationId, parsed.data);
  if (error) return fail(error, "No se pudo registrar el pago.");
  scheduleShopifySync();
  refresh(restorationId);
  return { ok: true };
}

/**
 * Aprueba la última pieza y registra el adelanto en el mismo paso (Paso 11.2, P43):
 * el pago queda antes de que se procese la orden, que se crea con él incluido.
 */
export async function approveWithPayment(
  restorationId: string,
  pieceIds: string[],
  input: PaymentInput | null,
): Promise<PaymentActionResult> {
  await requirePermission("pagos.registrar");
  const parsed = input ? paymentSchema.safeParse(input) : null;
  if (parsed && !parsed.success)
    return { error: "Revisa el monto, el método y la fecha." };
  const supabase = await createClient();
  const missing = await checkRequirements(supabase, "aprobada", pieceIds);
  if (missing) return { error: missing };
  const { error } = await supabase.rpc("change_piece_status", {
    p_piece_ids: pieceIds,
    p_to: "aprobada",
  });
  if (error) return fail(error, "No se pudo aprobar.");
  if (parsed) {
    const { error: payError } = await insertPayments(
      supabase,
      restorationId,
      parsed.data,
    );
    if (payError) {
      // La pieza ya quedó aprobada: el pago se puede registrar después.
      scheduleShopifySync();
      refresh(restorationId);
      return fail(
        payError,
        "Se aprobó, pero no se pudo registrar el pago. Regístralo desde Pagos.",
      );
    }
  }
  scheduleShopifySync();
  refresh(restorationId);
  return { ok: true };
}

const refundSchema = z.object({
  methodId: z.guid(),
  amountCents: cents,
  paidOn: date,
  reason: z.string().trim().min(1).max(500),
});
export type RefundInput = z.input<typeof refundSchema>;

/** Corrige un pago con un reembolso: solo el admin, con motivo (§7.5). */
export async function refundPayment(
  restorationId: string,
  input: RefundInput,
): Promise<PaymentActionResult> {
  await requirePermission("pagos.corregir");
  const parsed = refundSchema.safeParse(input);
  if (!parsed.success)
    return { error: "Revisa el monto, el método, la fecha y el motivo." };
  const supabase = await createClient();
  const { error } = await supabase.from("payments").insert({
    restoration_id: restorationId,
    kind: "reembolso",
    amount: Number(toDecimalString(parsed.data.amountCents)),
    payment_method_id: parsed.data.methodId,
    method_name: "-",
    paid_on: parsed.data.paidOn,
    reason: parsed.data.reason,
  });
  if (error) return fail(error, "No se pudo registrar el reembolso.");
  scheduleShopifySync();
  refresh(restorationId);
  return { ok: true };
}

/** Entrega confirmando que falta cobrar el saldo (P45): solo ventas y admin. */
export async function deliverWithBalance(
  restorationId: string | null,
  pieceIds: string[],
  note: string | null,
): Promise<PaymentActionResult> {
  await requirePermission("pagos.registrar");
  if (pieceIds.length === 0) return { error: "Elige al menos una pieza." };
  const supabase = await createClient();
  const missing = await checkRequirements(supabase, "entregada", pieceIds);
  if (missing) return { error: missing };
  const { error } = await supabase.rpc("deliver_pieces_with_balance", {
    p_piece_ids: pieceIds,
    p_note: note ?? undefined,
  });
  if (error) return fail(error, "No se pudo entregar.");
  scheduleShopifySync();
  if (restorationId) refresh(restorationId);
  revalidatePath("/piezas");
  return { ok: true };
}

/**
 * "Resincronizar pagos" (admin, Paso 11.4): vuelve a leer las transacciones de la
 * orden en Shopify y concilia (importa lo hecho en el POS, envía lo pendiente).
 */
export async function resyncPayments(
  restorationId: string,
): Promise<PaymentActionResult> {
  await requirePermission("pagos.corregir");
  if (!z.guid().safeParse(restorationId).success)
    return { error: "Restauración inválida." };
  const supabase = await createClient();
  const { data } = await supabase
    .from("restorations")
    .select("shopify_order_id")
    .eq("id", restorationId)
    .maybeSingle();
  if (!data?.shopify_order_id)
    return { error: "La restauración aún no tiene orden en Shopify." };
  // Encolar desde fuera de un webhook es solo de la clave secreta.
  const { error } = await createAdminClient().rpc("enqueue_payment_sync", {
    p_restoration_id: restorationId,
  });
  if (error) return { error: "No se pudo resincronizar los pagos." };
  scheduleShopifySync();
  refresh(restorationId);
  return { ok: true };
}
