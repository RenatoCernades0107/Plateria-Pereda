import type { WebhookHandler } from "@/server/shopify-webhooks/types";

export type ShopifyCustomerChange = {
  customerId: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
};

const text = (value: unknown) => (typeof value === "string" ? value : null);

/** Lee el cliente del payload de `customers/update` (formato REST del webhook). */
export function parseCustomerWebhook(
  payload: unknown,
): ShopifyCustomerChange | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  const customerId =
    text(p.admin_graphql_api_id) ??
    (typeof p.id === "number" || typeof p.id === "string"
      ? `gid://shopify/Customer/${p.id}`
      : null);
  if (!customerId) return null;
  return {
    customerId,
    firstName: text(p.first_name),
    lastName: text(p.last_name),
    email: text(p.email),
    phone: text(p.phone),
  };
}

/**
 * Cambios de clientes hechos en Shopify (P16): actualizan la persona o el contacto
 * vinculado sin volver a enviarlos a Shopify. `apply` devuelve cuántos registros cambió.
 */
export function clientWebhookHandlers(
  apply: (change: ShopifyCustomerChange) => Promise<number>,
): Record<string, WebhookHandler> {
  return {
    "customers/update": async (event) => {
      const change = parseCustomerWebhook(event.payload);
      if (!change) throw new Error("El webhook no trae el id del cliente");
      await apply(change);
    },
  };
}
