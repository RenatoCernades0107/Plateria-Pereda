"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { todayInLima } from "@/domain/delivery-date";
import { QUOTE_STATUSES, type QuoteStatus } from "@/domain/quote";
import { quoteDeliveryDatesError } from "@/domain/quote-delivery";
import type { TablesUpdate } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import {
  INVALID_ARGS,
  idArg,
  optionalIdArg,
  validArgs,
} from "@/lib/validation/action-args";
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

/** Fecha de entrega al cliente y del proveedor (vacía: la de por defecto). */
export type QuoteDeliveryDates = {
  deliveryDate: string;
  supplierDeliveryDate: string;
};

const deliveryDatesArg = z.object({
  deliveryDate: z.string().max(10),
  supplierDeliveryDate: z.string().max(10),
});

/** Las columnas a guardar, o el error para el usuario. */
function deliveryDatesRow(
  dates: QuoteDeliveryDates,
  current?: { deliveryDate: string | null; supplierDate: string | null },
):
  | { delivery_date: string; supplier_delivery_date: string | null }
  | { error: string } {
  const error = quoteDeliveryDatesError(
    dates.deliveryDate,
    dates.supplierDeliveryDate,
    todayInLima(),
    current,
  );
  if (error) return { error: `${error}.` };
  return {
    delivery_date: dates.deliveryDate,
    // En blanco, la BD pone la de por defecto (3 días antes de la de entrega).
    supplier_delivery_date: dates.supplierDeliveryDate || null,
  };
}

/**
 * Emite, acepta, rechaza o vuelve a emitir (las reglas las valida la BD). Al aceptarla
 * (el cliente la aprobó) se indican las fechas de entrega.
 */
export async function changeQuoteStatus(
  id: string,
  status: QuoteStatus,
  dates?: QuoteDeliveryDates,
): Promise<QuoteActionResult> {
  await requirePermission("cotizador.usar");
  if (
    !validArgs(
      [idArg, z.string(), deliveryDatesArg.optional()],
      [id, status, dates],
    )
  )
    return { error: INVALID_ARGS };
  if (!UUID.test(id) || !QUOTE_STATUSES.includes(status)) {
    return { error: "No se pudo cambiar el estado." };
  }
  let row: TablesUpdate<"quotes"> = { status };
  if (status === "aceptada") {
    const datesRow = deliveryDatesRow(
      dates ?? { deliveryDate: "", supplierDeliveryDate: "" },
    );
    if ("error" in datesRow) return datesRow;
    row = { ...row, ...datesRow };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quotes")
    .update(row)
    .eq("id", id)
    .select("id");
  if (error) {
    return { error: dbMessage(error, "No se pudo cambiar el estado.") };
  }
  if (data.length === 0) return { error: "La cotización no existe." };
  revalidateQuote(id);
  return { ok: true };
}

/** Cambia las fechas de entrega de una cotización aceptada. */
export async function setQuoteDeliveryDates(
  id: string,
  dates: QuoteDeliveryDates,
): Promise<QuoteActionResult> {
  await requirePermission("cotizador.usar");
  if (!validArgs([idArg, deliveryDatesArg], [id, dates]))
    return { error: INVALID_ARGS };
  if (!UUID.test(id)) return { error: "La cotización no existe." };
  const supabase = await createClient();
  const { data: current, error: readError } = await supabase
    .from("quotes")
    .select("status, delivery_date, supplier_delivery_date")
    .eq("id", id)
    .maybeSingle();
  if (readError) return { error: "No se pudieron guardar las fechas." };
  if (!current) return { error: "La cotización no existe." };
  if (current.status !== "aceptada") {
    return { error: "Solo una cotización aceptada lleva fechas de entrega." };
  }
  const row = deliveryDatesRow(dates, {
    deliveryDate: current.delivery_date,
    supplierDate: current.supplier_delivery_date,
  });
  if ("error" in row) return row;
  const { data, error } = await supabase
    .from("quotes")
    .update(row)
    .eq("id", id)
    .eq("status", "aceptada")
    .select("id");
  if (error) {
    return { error: dbMessage(error, "No se pudieron guardar las fechas.") };
  }
  if (data.length === 0) return { error: "La cotización no existe." };
  revalidateQuote(id);
  return { ok: true };
}

/**
 * Elige o cambia la sucursal que emite la cotización (razón social, RUC y cuenta del
 * PDF). Se puede en cualquier estado, para que las ya emitidas saquen su PDF.
 */
export async function setQuoteIssuer(
  id: string,
  issuerId: string | null,
): Promise<QuoteActionResult> {
  await requirePermission("cotizador.usar");
  if (!validArgs([idArg, optionalIdArg], [id, issuerId]))
    return { error: INVALID_ARGS };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quotes")
    .update({ issuer_id: issuerId })
    .eq("id", id)
    .select("id");
  if (error) {
    return {
      error:
        error.code === "23503"
          ? "La sucursal no existe."
          : "No se pudo guardar la sucursal.",
    };
  }
  if (data.length === 0) return { error: "La cotización no existe." };
  revalidateQuote(id);
  return { ok: true };
}

/** Copia la cotización como un borrador nuevo. */
export async function duplicateQuote(id: string): Promise<SaveQuoteResult> {
  await requirePermission("cotizador.usar");
  if (!validArgs([idArg], [id])) return { error: INVALID_ARGS };
  if (!UUID.test(id)) return { error: "La cotización no existe." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("duplicate_quote", { p_id: id });
  if (error) {
    return { error: dbMessage(error, "No se pudo duplicar la cotización.") };
  }
  revalidatePath("/cotizaciones");
  return { ok: true, id: data };
}
