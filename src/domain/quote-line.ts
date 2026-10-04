import { parseMoney, toCents, toDecimalString, type Cents } from "./money";
import {
  MAX_QUOTE_QUANTITY,
  type LineDiscount,
  type QuoteLineAmounts,
} from "./quote";

/**
 * Línea de la cotización mientras se edita (los números son textos, como los
 * escribe el usuario). Puede venir del catálogo de Shopify (producto y variante,
 * con sus datos copiados al elegirla) o ser una línea libre (P37, propuesta).
 */
export type QuoteLineDraft = {
  /** Identifica la línea en la lista (no se guarda). */
  key: string;
  shopifyProductId: string | null;
  shopifyVariantId: string | null;
  title: string;
  /** Vacío si el producto no tiene variantes. */
  variantTitle: string;
  sku: string | null;
  imageUrl: string | null;
  /** Precio del catálogo al elegir la variante ("150.00"). */
  catalogPrice: string | null;
  /** Descripción de la personalización. */
  customization: string;
  quantity: string;
  unitPrice: string;
  discountType: "" | "monto" | "porcentaje";
  discountValue: string;
};

/** Producto del catálogo con sus variantes (forma de `ShopifyProduct`). */
export type CatalogProduct = {
  id: string;
  title: string;
  imageUrl: string | null;
  variants: CatalogVariant[];
};

export type CatalogVariant = {
  id: string;
  title: string;
  /** Monto decimal de Shopify ("150.00"). */
  price: string;
  sku: string | null;
  imageUrl: string | null;
};

/** Shopify llama "Default Title" a la única variante de un producto sin opciones. */
export const DEFAULT_VARIANT_TITLE = "Default Title";

export function variantName(variant: Pick<CatalogVariant, "title">): string {
  return variant.title === DEFAULT_VARIANT_TITLE ? "" : variant.title;
}

/** "150.00" → "150.00" normalizado (céntimos exactos). */
function catalogAmount(price: string): string {
  return toDecimalString(toCents(Number(price)));
}

function newKey(): string {
  return globalThis.crypto.randomUUID();
}

/** Línea nueva a partir de la variante elegida, con el precio del catálogo. */
export function lineFromCatalog(
  product: CatalogProduct,
  variant: CatalogVariant,
  key: string = newKey(),
): QuoteLineDraft {
  const price = catalogAmount(variant.price);
  return {
    key,
    shopifyProductId: product.id,
    shopifyVariantId: variant.id,
    title: product.title,
    variantTitle: variantName(variant),
    sku: variant.sku || null,
    imageUrl: variant.imageUrl ?? product.imageUrl,
    catalogPrice: price,
    customization: "",
    quantity: "1",
    unitPrice: price,
    discountType: "",
    discountValue: "",
  };
}

/** Línea libre: un producto que no está en el catálogo (P37). */
export function freeLine(key: string = newKey()): QuoteLineDraft {
  return {
    key,
    shopifyProductId: null,
    shopifyVariantId: null,
    title: "",
    variantTitle: "",
    sku: null,
    imageUrl: null,
    catalogPrice: null,
    customization: "",
    quantity: "1",
    unitPrice: "",
    discountType: "",
    discountValue: "",
  };
}

/** Copia de una línea con otra clave (botón "Duplicar línea"). */
export function copyLine(
  line: QuoteLineDraft,
  key: string = newKey(),
): QuoteLineDraft {
  return { ...line, key };
}

/** Cantidad entera de 1 a 100 000 escrita por el usuario, o null. */
export function parseQuantity(text: string): number | null {
  const value = text.trim();
  if (!/^\d{1,6}$/.test(value)) return null;
  const quantity = Number(value);
  return quantity > 0 && quantity <= MAX_QUOTE_QUANTITY ? quantity : null;
}

/** Porcentaje de 0 a 100 con hasta 2 decimales, o null. */
export function parsePercent(text: string): number | null {
  const value = text.trim().replace(",", ".");
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(value)) return null;
  const percent = Number(value);
  return percent <= 100 ? percent : null;
}

function draftDiscount(line: QuoteLineDraft): LineDiscount {
  if (line.discountType === "monto") {
    const cents = parseMoney(line.discountValue);
    return cents ? { type: "monto", cents } : null;
  }
  if (line.discountType === "porcentaje") {
    const percent = parsePercent(line.discountValue);
    return percent ? { type: "porcentaje", percent } : null;
  }
  return null;
}

/**
 * Montos de una línea para los totales en vivo: lo que aún no es válido cuenta
 * como 0 (la validación del formulario muestra el error).
 */
export function draftAmounts(line: QuoteLineDraft): QuoteLineAmounts {
  const unitPrice: Cents = parseMoney(line.unitPrice) ?? 0;
  return {
    quantity: parseQuantity(line.quantity) ?? 0,
    unitPrice,
    discount: draftDiscount(line),
  };
}
