import { z } from "zod";

export const catalogItemSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Ingresa el nombre")
    .max(100, "Máximo 100 caracteres"),
  // Texto del formulario: vacío = sin precio sugerido.
  price: z
    .string()
    .trim()
    .refine(
      (v) => v === "" || /^\d{1,8}([.,]\d{1,2})?$/.test(v),
      "Ingresa un monto válido (hasta 2 decimales)",
    )
    .transform((v) => (v === "" ? null : Number(v.replace(",", ".")))),
});

export type CatalogItemFormInput = z.input<typeof catalogItemSchema>;
export type CatalogItemInput = z.output<typeof catalogItemSchema>;
