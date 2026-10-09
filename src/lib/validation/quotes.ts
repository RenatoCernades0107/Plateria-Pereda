import { z } from "zod";

import { parseMoney, toDecimalString } from "@/domain/money";
import { lineGross } from "@/domain/quote";
import {
  parsePercent,
  parseQuantity,
  type LineErrors,
  type LineField,
  type QuoteLineDraft,
} from "@/domain/quote-line";

/**
 * Validación del formulario de cotización (Paso 14.4). La usan el formulario (para
 * mostrar los errores en cada campo) y la acción del servidor (antes de guardar).
 */

const UUID = z.uuid("Elige un cliente");

const text = (max: number) =>
  z.string().trim().max(max, `Máximo ${max} caracteres`);

/** Céntimos ≥ 0 a partir del texto escrito ("150", "150.50", "1,500.00"). */
const price = z.string().transform((value, ctx) => {
  const cents = parseMoney(value);
  if (cents === null) {
    ctx.addIssue({
      code: "custom",
      message: value.trim()
        ? "Ingresa un precio válido (0 o más, hasta 2 decimales)"
        : "Ingresa el precio",
    });
    return z.NEVER;
  }
  return cents;
});

export const quoteLineSchema = z
  .object({
    key: z.uuid(),
    shopifyProductId: z.string().max(200).nullable(),
    shopifyVariantId: z.string().max(200).nullable(),
    title: text(200).pipe(z.string().min(1, "Describe el producto")),
    variantTitle: text(200),
    sku: z.string().trim().max(100).nullable(),
    imageUrl: z.url().max(2000).nullable(),
    catalogPrice: z.string().nullable(),
    customization: text(2000),
    quantity: z.string().transform((value, ctx) => {
      const quantity = parseQuantity(value);
      if (quantity === null) {
        ctx.addIssue({
          code: "custom",
          message: "La cantidad debe ser un entero mayor que 0 (hasta 100 000)",
        });
        return z.NEVER;
      }
      return quantity;
    }),
    unitPrice: price,
    discountType: z.enum(["", "monto", "porcentaje"]),
    discountValue: z.string(),
  })
  .transform((line, ctx) => {
    let discount: number | null = null;
    if (line.discountType === "monto") {
      discount = parseMoney(line.discountValue);
      if (discount === null) {
        ctx.addIssue({
          code: "custom",
          path: ["discountValue"],
          message: "Ingresa un monto válido",
        });
      } else if (discount > lineGross(line)) {
        ctx.addIssue({
          code: "custom",
          path: ["discountValue"],
          message:
            "El descuento no puede ser mayor que el subtotal de la línea",
        });
      }
    } else if (line.discountType === "porcentaje") {
      discount = parsePercent(line.discountValue);
      if (discount === null) {
        ctx.addIssue({
          code: "custom",
          path: ["discountValue"],
          message: "Ingresa un porcentaje de 0 a 100",
        });
      }
    }
    return {
      id: line.key,
      shopify_product_id: line.shopifyProductId,
      shopify_variant_id: line.shopifyProductId ? line.shopifyVariantId : null,
      title: line.title,
      variant_title: line.variantTitle,
      sku: line.sku || null,
      image_url: line.imageUrl,
      catalog_price:
        line.catalogPrice === null ? null : parseMoney(line.catalogPrice),
      customization: line.customization,
      quantity: line.quantity,
      unit_price: line.unitPrice,
      discount_type: line.discountType && discount ? line.discountType : null,
      // Monto en céntimos o porcentaje.
      discount_value: line.discountType && discount ? discount : 0,
    };
  });

export const quoteSchema = z.object({
  clientId: UUID,
  contactId: z.uuid().nullable(),
  validityDays: z.string().transform((value, ctx) => {
    const days = /^\d{1,3}$/.test(value.trim()) ? Number(value) : NaN;
    if (!(days >= 1 && days <= 365)) {
      ctx.addIssue({
        code: "custom",
        message: "La vigencia debe ser de 1 a 365 días",
      });
      return z.NEVER;
    }
    return days;
  }),
  /** "¿El precio incluye IGV?" (P13): se responde siempre. */
  pricesIncludeIgv: z
    .enum(["si", "no"], { error: "Indica si el precio incluye IGV" })
    .transform((v) => v === "si"),
  notes: text(2000),
  terms: text(5000),
  lines: z.array(quoteLineSchema).min(1, "Agrega al menos un producto"),
});

export type QuoteFormInput = {
  clientId: string;
  contactId: string | null;
  validityDays: string;
  /** "si", "no" o "" (sin responder). */
  pricesIncludeIgv: "" | "si" | "no";
  notes: string;
  terms: string;
  lines: QuoteLineDraft[];
};

export type QuoteInput = z.output<typeof quoteSchema>;

/** Filas para `save_quote` (montos en soles con 2 decimales). */
export function quoteRpcArgs(v: QuoteInput) {
  return {
    p_quote: {
      client_id: v.clientId,
      contact_id: v.contactId,
      validity_days: v.validityDays,
      prices_include_igv: v.pricesIncludeIgv,
      notes: v.notes,
      terms: v.terms,
    },
    p_items: v.lines.map((line) => ({
      ...line,
      catalog_price:
        line.catalog_price === null
          ? null
          : toDecimalString(line.catalog_price),
      unit_price: toDecimalString(line.unit_price),
      discount_value:
        line.discount_type === "monto"
          ? toDecimalString(line.discount_value)
          : String(line.discount_value),
    })),
  };
}

export type QuoteFormErrors = {
  clientId?: string;
  validityDays?: string;
  pricesIncludeIgv?: string;
  notes?: string;
  terms?: string;
  lines?: string;
  byLine: LineErrors;
};

const LINE_FIELDS: readonly string[] = [
  "title",
  "customization",
  "quantity",
  "unitPrice",
  "discountValue",
] satisfies LineField[];

/** Errores del formulario por campo; null si es válido. */
export function quoteFormErrors(input: QuoteFormInput): QuoteFormErrors | null {
  const parsed = quoteSchema.safeParse(input);
  if (parsed.success) return null;
  const errors: QuoteFormErrors = { byLine: {} };
  for (const issue of parsed.error.issues) {
    const [first, index, field] = issue.path;
    if (first === "lines" && typeof index === "number") {
      const key = input.lines[index]?.key;
      if (key && typeof field === "string" && LINE_FIELDS.includes(field)) {
        errors.byLine[key] ??= {};
        errors.byLine[key][field as LineField] ??= issue.message;
      }
    } else if (first === "lines") {
      errors.lines ??= issue.message;
    } else if (
      first === "clientId" ||
      first === "validityDays" ||
      first === "pricesIncludeIgv" ||
      first === "notes" ||
      first === "terms"
    ) {
      errors[first] ??= issue.message;
    }
  }
  return errors;
}
