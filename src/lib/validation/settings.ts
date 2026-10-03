import { z } from "zod";

import { isValidRuc } from "@/domain/ruc";
import { unknownPlaceholders } from "@/domain/whatsapp-template";

const text = (max: number) =>
  z.string().trim().max(max, `Máximo ${max} caracteres`);

export const settingsSchema = z.object({
  legalName: text(200).min(1, "Ingresa la razón social"),
  ruc: z
    .string()
    .trim()
    .refine((v) => v === "" || isValidRuc(v), "Ingresa un RUC válido"),
  address: text(300),
  phones: text(200),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .refine(
      (v) => v === "" || z.email().safeParse(v).success,
      "Ingresa un email válido",
    ),
  quoteValidityDays: z.coerce
    .number<string | number>({ error: "Ingresa un número de días" })
    .int("Ingresa un número entero de días")
    .min(1, "Debe ser al menos 1 día")
    .max(365, "Máximo 365 días"),
  depositPercent: z.coerce
    .number<string | number>({ error: "Ingresa un porcentaje" })
    .min(1, "Debe estar entre 1 y 100 %")
    .max(100, "Debe estar entre 1 y 100 %")
    .refine(
      (v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-9,
      "Máximo dos decimales",
    ),
  whatsappTemplate: text(4000).superRefine((value, ctx) => {
    const unknown = unknownPlaceholders(value);
    if (unknown.length > 0) {
      ctx.addIssue({
        code: "custom",
        message: `Variables desconocidas: ${unknown.map((v) => `{${v}}`).join(", ")}`,
      });
    }
  }),
  terms: text(5000),
});

export type SettingsFormInput = z.input<typeof settingsSchema>;
export type SettingsInput = z.output<typeof settingsSchema>;

export const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;

/** Error del archivo de logo, o null si se puede subir. */
export function logoFileError(file: { type: string; size: number }) {
  if (!LOGO_TYPES.includes(file.type as (typeof LOGO_TYPES)[number])) {
    return "El logo debe ser PNG, JPG o WebP.";
  }
  if (file.size > LOGO_MAX_BYTES) return "El logo debe pesar como máximo 2 MB.";
  return null;
}
