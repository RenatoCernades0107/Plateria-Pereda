"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { MAX_CENTS, toDecimalString } from "@/domain/money";
import {
  MAX_INVOICE_NUMBER_LENGTH,
  parseInvoiceNumber,
} from "@/domain/quote-payments";
import { createClient } from "@/lib/supabase/server";
import { INVALID_ARGS, idArg, validArgs } from "@/lib/validation/action-args";
import { requirePermission } from "@/server/auth";

export type QuotePaymentResult = { ok: true } | { error: string };

const READABLE = new Set(["23514", "42501", "23503", "22023"]);
const fail = (
  error: { code?: string; message?: string },
  fallback: string,
): QuotePaymentResult => ({
  error:
    READABLE.has(error.code ?? "") && error.message
      ? `${error.message.replace(/\.$/, "")}.`
      : fallback,
});

const paymentSchema = z.object({
  paidOn: z.iso.date(),
  /** Un pago por método (hasta 5), todos con la misma fecha y factura. */
  rows: z
    .array(
      z.object({
        methodId: z.guid(),
        amountCents: z.number().int().positive().max(MAX_CENTS),
      }),
    )
    .min(1)
    .max(5),
  /** N.º de factura del pago; en blanco, sin factura. */
  invoiceNumber: z.string().max(200).default(""),
});
export type QuotePaymentInput = z.input<typeof paymentSchema>;

function refresh(quoteId: string) {
  revalidatePath(`/cotizaciones/${quoteId}`);
  revalidatePath("/cotizaciones");
}

/**
 * Registra un pago de una cotización aceptada o facturada, repartido en uno o más
 * métodos. Sin Shopify. La BD valida el estado y que no pase del saldo.
 */
export async function registerQuotePayment(
  quoteId: string,
  input: QuotePaymentInput,
): Promise<QuotePaymentResult> {
  await requirePermission("cotizador.usar");
  const parsed = paymentSchema.safeParse(input);
  if (!parsed.success || !idArg.safeParse(quoteId).success)
    return { error: "Revisa el monto, el método y la fecha." };
  const invoice = parseInvoiceNumber(parsed.data.invoiceNumber);
  if ("error" in invoice) return invoice;
  const supabase = await createClient();
  const { error } = await supabase.from("quote_payments").insert(
    parsed.data.rows.map((row) => ({
      quote_id: quoteId,
      amount: Number(toDecimalString(row.amountCents)),
      payment_method_id: row.methodId,
      // La BD lo reemplaza por el nombre del método elegido.
      method_name: "-",
      paid_on: parsed.data.paidOn,
      invoice_number: invoice.value,
    })),
  );
  if (error) return fail(error, "No se pudo registrar el pago.");
  refresh(quoteId);
  return { ok: true };
}

/** Asigna, cambia o quita el N.º de factura de un pago (vacío lo quita). */
export async function setQuotePaymentInvoice(
  quoteId: string,
  paymentId: string,
  invoiceNumber: string,
): Promise<QuotePaymentResult> {
  await requirePermission("cotizador.usar");
  if (
    !validArgs(
      [idArg, idArg, z.string().max(MAX_INVOICE_NUMBER_LENGTH * 4)],
      [quoteId, paymentId, invoiceNumber],
    )
  )
    return { error: INVALID_ARGS };
  const invoice = parseInvoiceNumber(invoiceNumber);
  if ("error" in invoice) return invoice;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quote_payments")
    .update({ invoice_number: invoice.value })
    .eq("id", paymentId)
    .eq("quote_id", quoteId)
    .select("id");
  if (error) return fail(error, "No se pudo guardar el número de factura.");
  if (data.length === 0) return { error: "El pago no existe." };
  refresh(quoteId);
  return { ok: true };
}

/** Elimina un pago registrado por error (solo el admin; queda en la auditoría). */
export async function deleteQuotePayment(
  quoteId: string,
  paymentId: string,
): Promise<QuotePaymentResult> {
  await requirePermission("pagos.corregir");
  if (!validArgs([idArg, idArg], [quoteId, paymentId]))
    return { error: INVALID_ARGS };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quote_payments")
    .delete()
    .eq("id", paymentId)
    .eq("quote_id", quoteId)
    .select("id");
  if (error) return fail(error, "No se pudo eliminar el pago.");
  if (data.length === 0) return { error: "El pago no existe." };
  refresh(quoteId);
  return { ok: true };
}
