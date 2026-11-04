import { z } from "zod";

import { QUOTE_ISSUER_DOCUMENT_TYPES } from "@/domain/quote-issuers";
import { isValidRuc } from "@/domain/ruc";

/**
 * Formulario de una sucursal de cotización (Configuración, solo admin). Los datos salen
 * en el PDF de la cotización, así que se validan con cuidado: DNI de 8 dígitos, RUC
 * válido (dígito verificador) y CCI de 20 dígitos.
 */

const text = (label: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `Ingresa ${label}`)
    .max(max, `Máximo ${max} caracteres`);

/** Sin espacios: "194 0637923065" → "1940637923065". */
const digits = z.string().transform((v) => v.replace(/\s+/g, ""));

export const quoteIssuerSchema = z
  .object({
    name: text("el nombre", 60),
    legalName: text("la razón social o el titular", 200),
    documentType: z.enum(QUOTE_ISSUER_DOCUMENT_TYPES),
    documentNumber: digits,
    bankName: text("el banco", 100),
    accountLabel: text("el tipo de cuenta", 60),
    accountNumber: digits.pipe(
      z.string().regex(/^[0-9-]{6,30}$/, "Ingresa un número de cuenta válido"),
    ),
    cci: digits.pipe(
      z.string().regex(/^\d{20}$/, "El CCI debe tener 20 dígitos"),
    ),
  })
  .superRefine((v, ctx) => {
    const ok =
      v.documentType === "dni"
        ? /^\d{8}$/.test(v.documentNumber)
        : isValidRuc(v.documentNumber);
    if (!ok) {
      ctx.addIssue({
        code: "custom",
        path: ["documentNumber"],
        message:
          v.documentType === "dni"
            ? "El DNI debe tener 8 dígitos"
            : "Ingresa un RUC válido (11 dígitos)",
      });
    }
  });

export type QuoteIssuerFormInput = z.input<typeof quoteIssuerSchema>;
export type QuoteIssuerFormField = keyof QuoteIssuerFormInput;
export type QuoteIssuerFormErrors = Partial<
  Record<QuoteIssuerFormField, string>
>;

/** Errores por campo; null si es válido. */
export function quoteIssuerFormErrors(
  input: QuoteIssuerFormInput,
): QuoteIssuerFormErrors | null {
  const parsed = quoteIssuerSchema.safeParse(input);
  if (parsed.success) return null;
  const errors: QuoteIssuerFormErrors = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0] as QuoteIssuerFormField;
    errors[field] ??= issue.message;
  }
  return errors;
}
