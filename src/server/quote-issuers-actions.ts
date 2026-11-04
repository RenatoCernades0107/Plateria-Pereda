"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { QUOTE_ISSUERS_HREF } from "@/domain/quote-issuers";
import { createClient } from "@/lib/supabase/server";
import { INVALID_ARGS, idArg, validArgs } from "@/lib/validation/action-args";
import {
  quoteIssuerSchema,
  type QuoteIssuerFormInput,
} from "@/lib/validation/quote-issuers";
import { requirePermission } from "@/server/auth";

/**
 * Sucursales de cotización (Configuración, solo admin): razón social, DNI/RUC y cuenta
 * bancaria que salen en el PDF. La BD también exige el rol admin (RLS).
 */

export type QuoteIssuerActionResult = { ok: true } | { error: string };

function revalidate() {
  revalidatePath(QUOTE_ISSUERS_HREF);
  // El selector y el PDF de las cotizaciones muestran estos datos.
  revalidatePath("/cotizaciones", "layout");
}

function failure(code: string | undefined, fallback: string) {
  return {
    error:
      code === "23505" ? "Ya existe una sucursal con ese nombre." : fallback,
  };
}

function row(input: QuoteIssuerFormInput) {
  const parsed = quoteIssuerSchema.safeParse(input);
  if (!parsed.success) return null;
  const v = parsed.data;
  return {
    name: v.name,
    legal_name: v.legalName,
    document_type: v.documentType,
    document_number: v.documentNumber,
    bank_name: v.bankName,
    account_label: v.accountLabel,
    account_number: v.accountNumber,
    cci: v.cci,
  };
}

export async function createQuoteIssuer(
  input: QuoteIssuerFormInput,
): Promise<QuoteIssuerActionResult> {
  await requirePermission("configuracion.gestionar");
  const values = row(input);
  if (!values) return { error: "Revisa los datos ingresados." };
  const supabase = await createClient();
  const { error } = await supabase.from("quote_issuers").insert(values);
  if (error) return failure(error.code, "No se pudo crear la sucursal.");
  revalidate();
  return { ok: true };
}

export async function updateQuoteIssuer(
  id: string,
  input: QuoteIssuerFormInput,
): Promise<QuoteIssuerActionResult> {
  await requirePermission("configuracion.gestionar");
  if (!validArgs([idArg, z.unknown()], [id, input]))
    return { error: INVALID_ARGS };
  const values = row(input);
  if (!values) return { error: "Revisa los datos ingresados." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quote_issuers")
    .update(values)
    .eq("id", id)
    .select("id");
  if (error) return failure(error.code, "No se pudo guardar la sucursal.");
  if (data.length === 0) return { error: "No se pudo guardar la sucursal." };
  revalidate();
  return { ok: true };
}

export async function setQuoteIssuerActive(
  id: string,
  active: boolean,
): Promise<QuoteIssuerActionResult> {
  await requirePermission("configuracion.gestionar");
  if (!validArgs([idArg, z.boolean()], [id, active]))
    return { error: INVALID_ARGS };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quote_issuers")
    .update({ active })
    .eq("id", id)
    .select("id");
  if (error || data.length === 0)
    return { error: "No se pudo actualizar la sucursal." };
  revalidate();
  return { ok: true };
}

/** Solo si ninguna cotización la usa (lo garantiza un trigger: 23503 con el mensaje). */
export async function deleteQuoteIssuer(
  id: string,
): Promise<QuoteIssuerActionResult> {
  await requirePermission("configuracion.gestionar");
  if (!validArgs([idArg], [id])) return { error: INVALID_ARGS };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quote_issuers")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) {
    return {
      error:
        error.code === "23503"
          ? error.message
          : "No se pudo eliminar la sucursal.",
    };
  }
  if (data.length === 0) return { error: "No se pudo eliminar la sucursal." };
  revalidate();
  return { ok: true };
}
