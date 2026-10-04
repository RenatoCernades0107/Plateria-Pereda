"use server";

import type { CatalogProduct } from "@/domain/quote-line";
import { requirePermission } from "@/server/auth";
import { getShopifyGateway } from "@/server/shopify";
import type { ShopifyProductSummary } from "@/server/shopify";

export type CatalogSearchResult =
  { ok: true; products: ShopifyProductSummary[] } | { error: string };

export type CatalogProductResult =
  { ok: true; product: CatalogProduct } | { error: string };

const LIMIT = 10;
const UNAVAILABLE = "Shopify no respondió. Intenta de nuevo.";

/** Busca productos del catálogo de Shopify por título o SKU. */
export async function searchCatalog(
  query: string,
): Promise<CatalogSearchResult> {
  await requirePermission("cotizador.usar");
  const text = query.trim().slice(0, 100);
  if (text.length < 2) return { ok: true, products: [] };
  try {
    const page = await getShopifyGateway().searchProducts(text, {
      first: LIMIT,
    });
    return { ok: true, products: page.items };
  } catch {
    return { error: UNAVAILABLE };
  }
}

/** Producto con sus variantes, para elegir la que se cotiza. */
export async function getCatalogProduct(
  id: string,
): Promise<CatalogProductResult> {
  await requirePermission("cotizador.usar");
  if (!id.startsWith("gid://shopify/Product/")) {
    return { error: "Producto inválido." };
  }
  try {
    const product = await getShopifyGateway().getProduct(id);
    if (!product) return { error: "El producto ya no existe en Shopify." };
    return {
      ok: true,
      product: {
        id: product.id,
        title: product.title,
        imageUrl: product.imageUrl,
        variants: product.variants,
      },
    };
  } catch {
    return { error: UNAVAILABLE };
  }
}
