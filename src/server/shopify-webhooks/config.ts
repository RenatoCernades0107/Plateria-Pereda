import type { ServerEnv } from "@/lib/env";

/** En modo fake (desarrollo y tests) los webhooks se firman con este secreto. */
export const FAKE_WEBHOOK_SECRET = "pereda-fake-webhook-secret";
export const FAKE_SHOP_DOMAIN = "pereda-fake.myshopify.com";

type Env = Pick<
  ServerEnv,
  "SHOPIFY_MODE" | "SHOPIFY_CLIENT_SECRET" | "SHOPIFY_STORE_DOMAIN"
>;

/** Secreto para verificar la firma; sin él (live mal configurado) se rechaza todo. */
export function webhookSecret(env: Env): string | null {
  if (env.SHOPIFY_MODE === "live") return env.SHOPIFY_CLIENT_SECRET ?? null;
  return env.SHOPIFY_CLIENT_SECRET ?? FAKE_WEBHOOK_SECRET;
}

/** Tienda de la que se aceptan webhooks. */
export function expectedShopDomain(env: Env): string | null {
  if (env.SHOPIFY_MODE === "live") return env.SHOPIFY_STORE_DOMAIN ?? null;
  return env.SHOPIFY_STORE_DOMAIN ?? FAKE_SHOP_DOMAIN;
}
