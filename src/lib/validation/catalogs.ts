import { z } from "zod";

import type { CatalogKind } from "@/domain/catalogs";

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
  // Solo métodos de pago (D34): nombre exacto del pago manual en Shopify.
  shopifyName: z.string().trim().max(100, "Máximo 100 caracteres").optional(),
});

export type CatalogItemFormInput = z.input<typeof catalogItemSchema>;
export type CatalogItemInput = z.output<typeof catalogItemSchema>;

/**
 * Sucursales: el nombre va como etiqueta del pedido de Shopify, que acepta hasta 40
 * caracteres y usa la coma para separar etiquetas.
 */
const branchItemSchema = catalogItemSchema.extend({
  name: catalogItemSchema.shape.name
    .refine((v) => v.length <= 40, "Máximo 40 caracteres")
    .refine(
      (v) => !v.includes(","),
      "Sin comas (Shopify las usa para separar etiquetas)",
    ),
});

/** Esquema del formulario según el catálogo. */
export const catalogItemSchemaFor = (kind: CatalogKind) =>
  kind === "branches" ? branchItemSchema : catalogItemSchema;
