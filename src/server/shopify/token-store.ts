import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import type { TokenStore } from "./token";

/** Guarda el token en `shopify_tokens` para compartirlo entre funciones del servidor. */
export const supabaseTokenStore: TokenStore = {
  async read(shop) {
    const { data, error } = await createAdminClient()
      .from("shopify_tokens")
      .select("access_token, expires_at")
      .eq("shop_domain", shop)
      .maybeSingle();
    if (error) throw error;
    return data
      ? { accessToken: data.access_token, expiresAt: new Date(data.expires_at) }
      : null;
  },
  async write(shop, token) {
    const { error } = await createAdminClient().from("shopify_tokens").upsert({
      shop_domain: shop,
      access_token: token.accessToken,
      expires_at: token.expiresAt.toISOString(),
    });
    if (error) throw error;
  },
  async clear(shop) {
    const { error } = await createAdminClient()
      .from("shopify_tokens")
      .delete()
      .eq("shop_domain", shop);
    if (error) throw error;
  },
};
