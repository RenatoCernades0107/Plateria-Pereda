"use server";

import { revalidatePath } from "next/cache";

import { toSoles } from "@/domain/money";
import { can } from "@/domain/permissions";
import { createClient } from "@/lib/supabase/server";
import {
  copyRestorationSchema,
  invalidInputMessage,
  whatsappQuoteSchema,
  type RestorationFormInput,
  type WhatsappQuoteFormInput,
  type WhatsappQuoteInput,
} from "@/lib/validation/restorations";
import { requirePermission } from "@/server/auth";
import {
  DEPOSIT_NOT_RECORDED,
  recordInitialDeposit,
} from "@/server/payments/initial-deposit";
import {
  pieceToRpc,
  withoutSalePrices,
  withoutWorkshops,
} from "@/server/restorations/create";
import { scheduleShopifySync } from "@/server/shopify-sync/run";

export type QuoteActionResult = { ok: true } | { error: string };
/** `warning`: la restauración se creó, pero su adelanto no se registró como pago. */
export type CreatedResult =
  { ok: true; id: string; code: string; warning?: string } | { error: string };

/** Las RPC de la BD ya traen mensajes en español para estos códigos. */
const READABLE = new Set(["23514", "42501", "23503", "22023"]);

function fail(
  error: { code?: string; message?: string },
  fallback: string,
): { error: string } {
  return {
    error:
      READABLE.has(error.code ?? "") && error.message
        ? error.message
        : fallback,
  };
}

/** Datos de la cotización en el formato de `create_whatsapp_quote` / `update_whatsapp_quote`. */
function quoteArgs(v: WhatsappQuoteInput) {
  return {
    p_client_id: v.clientId as string,
    p_contact_id: v.contactId as string,
    p_customer_name: v.customerName,
    p_customer_phone: v.customerPhone,
    p_payment_type: v.paymentType,
    p_deposit_percent: v.depositPercent as number,
    p_notes: v.notes,
    p_items: v.pieces.map(pieceToRpc),
    p_prices_include_igv: v.pricesIncludeIgv,
  };
}

/** Registra una cotización de WhatsApp (P46): no crea restauración ni va a Shopify. */
export async function createWhatsappQuote(
  input: WhatsappQuoteFormInput,
): Promise<CreatedResult> {
  await requirePermission("cotizaciones-whatsapp.usar");
  const parsed = whatsappQuoteSchema.safeParse(input);
  if (!parsed.success) return { error: "Revisa los datos ingresados." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("create_whatsapp_quote", quoteArgs(parsed.data))
    .single();
  if (error) return fail(error, "No se pudo registrar la cotización.");
  revalidatePath("/cotizaciones-whatsapp");
  return { ok: true, id: data.id, code: data.code };
}

/** Edita la cotización: solo hasta la primera copia (la BD lo exige). */
export async function updateWhatsappQuote(
  id: string,
  input: WhatsappQuoteFormInput,
): Promise<QuoteActionResult> {
  await requirePermission("cotizaciones-whatsapp.usar");
  const parsed = whatsappQuoteSchema.safeParse(input);
  if (!parsed.success) return { error: "Revisa los datos ingresados." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_whatsapp_quote", {
    p_id: id,
    ...quoteArgs(parsed.data),
  });
  if (error) return fail(error, "No se pudo guardar la cotización.");
  revalidatePath(`/cotizaciones-whatsapp/${id}`);
  revalidatePath("/cotizaciones-whatsapp");
  return { ok: true };
}

export async function discardWhatsappQuote(
  id: string,
  reason: string,
): Promise<QuoteActionResult> {
  await requirePermission("cotizaciones-whatsapp.usar");
  const supabase = await createClient();
  const { error } = await supabase.rpc("discard_whatsapp_quote", {
    p_id: id,
    p_reason: reason,
  });
  if (error) return fail(error, "No se pudo descartar la cotización.");
  revalidatePath(`/cotizaciones-whatsapp/${id}`);
  return { ok: true };
}

export async function reopenWhatsappQuote(
  id: string,
): Promise<QuoteActionResult> {
  await requirePermission("cotizaciones-whatsapp.usar");
  const supabase = await createClient();
  const { error } = await supabase.rpc("reopen_whatsapp_quote", { p_id: id });
  if (error) return fail(error, "No se pudo reabrir la cotización.");
  revalidatePath(`/cotizaciones-whatsapp/${id}`);
  return { ok: true };
}

/**
 * "Crear restauración" desde la cotización (P46 y P49): cliente obligatorio y piezas
 * elegidas (y nuevas) que nacen Registradas y pasan al estado inicial elegido
 * (Consulta con nota, o Aprobada).
 */
export async function createRestorationFromQuote(
  quoteId: string,
  input: RestorationFormInput,
): Promise<CreatedResult> {
  const user = await requirePermission("restauraciones.editar");
  const parsed = copyRestorationSchema.safeParse(input);
  if (!parsed.success) return { error: invalidInputMessage(parsed.error) };
  const v = parsed.data;
  // Sin ser admin se conserva el precio cotizado y las piezas nuevas quedan sin
  // precio de venta (D58); sin el permiso del taller, sin taller (D60).
  let pieces = can(user.role, "piezas.precio-venta")
    ? v.pieces
    : withoutSalePrices(v.pieces, { keepQuoted: true });
  if (!can(user.role, "piezas.asignar-taller"))
    pieces = withoutWorkshops(pieces);
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("create_restoration_from_whatsapp_quote", {
      p_quote_id: quoteId,
      p_client_id: v.clientId,
      p_contact_id: v.contactId as string,
      p_payment_type: v.paymentType,
      p_deposit_percent: null as unknown as number,
      p_deposit_amount:
        v.depositAmount === null ? undefined : toSoles(v.depositAmount),
      p_notes: v.notes,
      p_pieces: pieces.map(pieceToRpc),
      p_prices_include_igv: v.pricesIncludeIgv,
    })
    .single();
  if (error) return fail(error, "No se pudo crear la restauración.");
  // El adelanto se registra como pago antes de que se procese la orden (la incluye).
  const recorded =
    v.depositAmount !== null && v.depositAmount > 0 && v.depositMethodId
      ? await recordInitialDeposit(supabase, data.id, v.depositMethodId)
      : true;
  // Con todas las piezas Aprobadas se encola la orden de Shopify (9.1).
  scheduleShopifySync();
  revalidatePath(`/cotizaciones-whatsapp/${quoteId}`);
  revalidatePath("/restauraciones");
  return recorded
    ? { ok: true, id: data.id, code: data.code }
    : { ok: true, id: data.id, code: data.code, warning: DEPOSIT_NOT_RECORDED };
}
