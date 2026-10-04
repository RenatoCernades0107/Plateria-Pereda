"use server";

import { revalidatePath } from "next/cache";

import { QUOTE_STATUSES, type QuoteStatus } from "@/domain/quote";
import { createClient } from "@/lib/supabase/server";
import {
  quoteRpcArgs,
  quoteSchema,
  type QuoteFormInput,
} from "@/lib/validation/quotes";
import { requirePermission } from "@/server/auth";

export type SaveQuoteResult = { ok: true; id: string } | { error: string };
export type QuoteActionResult = { ok: true } | { error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Mensaje para el usuario de un error de la BD (los de las reglas ya están en español). */
function dbMessage(
  error: { code?: string; message: string },
  fallback: string,
): string {
  if (error.code === "23514" && !error.message.includes("constraint")) {
    return `${error.message}.`;
  }
  if (error.code === "P0002") return "La cotización no existe.";
  return fallback;
}

function revalidateQuote(id: string) {
  revalidatePath("/cotizaciones");
  revalidatePath(`/cotizaciones/${id}`);
}

/** Guarda el borrador (nuevo si `id` es null) con sus líneas, en una transacción. */
export async function saveQuote(
  id: string | null,
  input: QuoteFormInput,
): Promise<SaveQuoteResult> {
  await requirePermission("cotizador.usar");
  if (id !== null && !UUID.test(id))
    return { error: "La cotización no existe." };
  const parsed = quoteSchema.safeParse(input);
  if (!parsed.success) return { error: "Revisa los datos de la cotización." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_quote", {
    // Sin id, la función crea la cotización.
    p_id: id as string,
    ...quoteRpcArgs(parsed.data),
  });
  if (error) {
    return { error: dbMessage(error, "No se pudo guardar la cotización.") };
  }
  revalidateQuote(data);
  return { ok: true, id: data };
}

/** Emite, acepta, rechaza o vuelve a emitir (las reglas las valida la BD). */
export async function changeQuoteStatus(
  id: string,
  status: QuoteStatus,
): Promise<QuoteActionResult> {
  await requirePermission("cotizador.usar");
  if (!UUID.test(id) || !QUOTE_STATUSES.includes(status)) {
    return { error: "No se pudo cambiar el estado." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quotes")
    .update({ status })
    .eq("id", id)
    .select("id");
  if (error) {
    return { error: dbMessage(error, "No se pudo cambiar el estado.") };
  }
  if (data.length === 0) return { error: "La cotización no existe." };
  revalidateQuote(id);
  return { ok: true };
}

/** Copia la cotización como un borrador nuevo. */
export async function duplicateQuote(id: string): Promise<SaveQuoteResult> {
  await requirePermission("cotizador.usar");
  if (!UUID.test(id)) return { error: "La cotización no existe." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("duplicate_quote", { p_id: id });
  if (error) {
    return { error: dbMessage(error, "No se pudo duplicar la cotización.") };
  }
  revalidatePath("/cotizaciones");
  return { ok: true, id: data };
}
