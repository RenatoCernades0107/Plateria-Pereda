/**
 * Enlace a una orden en el admin de Shopify (`https://tienda.myshopify.com/admin/orders/123`).
 * null si no hay tienda configurada (modo fake) o el id no es de una orden.
 */
export function shopifyOrderAdminUrl(
  shopDomain: string | undefined,
  orderGid: string | null,
): string | null {
  const id = orderGid?.match(/^gid:\/\/shopify\/Order\/(\d+)$/)?.[1];
  if (!shopDomain || !id) return null;
  return `https://${shopDomain}/admin/orders/${id}`;
}

/** Enlace a un borrador en el admin de Shopify (`/admin/draft_orders/123`). */
export function shopifyDraftOrderAdminUrl(
  shopDomain: string | undefined,
  draftGid: string | null,
): string | null {
  const id = draftGid?.match(/^gid:\/\/shopify\/DraftOrder\/(\d+)$/)?.[1];
  if (!shopDomain || !id) return null;
  return `https://${shopDomain}/admin/draft_orders/${id}`;
}
