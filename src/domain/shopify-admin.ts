/**
 * Enlace a una orden en el admin de Shopify: `gid://shopify/Order/123` en la tienda
 * `tienda.myshopify.com` → `https://admin.shopify.com/store/tienda/orders/123`.
 * Null sin tienda configurada (modo fake) o con un id que no es de una orden.
 */
export function shopifyAdminOrderUrl(
  storeDomain: string | undefined,
  orderId: string | null,
): string | null {
  const id = orderId?.match(/^gid:\/\/shopify\/Order\/(\d+)$/)?.[1];
  const store = storeDomain?.replace(/\.myshopify\.com$/, "");
  return id && store
    ? `https://admin.shopify.com/store/${store}/orders/${id}`
    : null;
}
