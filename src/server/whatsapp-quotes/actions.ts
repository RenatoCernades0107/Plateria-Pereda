"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import {
  copyRestorationSchema,
  whatsappQuoteSchema,
  type RestorationFormInput,
  type WhatsappQuoteFormInput,
  type WhatsappQuoteInput,
} from "@/lib/validation/restorations";
import { requirePermission } from "@/server/auth";
import { pieceToRpc } from "@/server/restorations/create";

export type QuoteActionResult = { ok: true } | { error: string };
export type CreatedResult =
  { ok: true; id: string; code: string } | { error: string };

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
  await requirePermission("restauraciones.editar");
  const parsed = copyRestorationSchema.safeParse(input);
  if (!parsed.success) return { error: "Revisa los datos ingresados." };
  const v = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("create_restoration_from_whatsapp_quote", {
      p_quote_id: quoteId,
      p_client_id: v.clientId,
      p_contact_id: v.contactId as string,
      p_payment_type: v.paymentType,
      p_deposit_percent: v.depositPercent as number,
      p_notes: v.notes,
      p_pieces: v.pieces.map(pieceToRpc),
    })
    .single();
  if (error) return fail(error, "No se pudo crear la restauración.");
  revalidatePath(`/cotizaciones-whatsapp/${quoteId}`);
  revalidatePath("/restauraciones");
  return { ok: true, id: data.id, code: data.code };
}
