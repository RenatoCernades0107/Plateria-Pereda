import "server-only";

import { serverEnv } from "@/lib/env.server";

import { FakeShopifyGateway } from "./fake";
import type { ShopifyGateway } from "./gateway";
import { createGraphqlClient } from "./graphql-client";
import { LiveShopifyGateway } from "./live";
import { createTokenProvider } from "./token";
import { supabaseTokenStore } from "./token-store";

export type { ShopifyGateway } from "./gateway";
export * from "./errors";
export type * from "./types";

let gateway: ShopifyGateway | undefined;

/** Adaptador según SHOPIFY_MODE: `fake` en desarrollo y tests, `live` con la tienda. */
export function getShopifyGateway(): ShopifyGateway {
  if (gateway) return gateway;
  const env = serverEnv();
  if (env.SHOPIFY_MODE === "fake") {
    gateway = new FakeShopifyGateway();
    return gateway;
  }
  // parseServerEnv garantiza estas variables con SHOPIFY_MODE=live.
  const shop = env.SHOPIFY_STORE_DOMAIN!;
  const tokens = createTokenProvider({
    shop,
    clientId: env.SHOPIFY_CLIENT_ID!,
    clientSecret: env.SHOPIFY_CLIENT_SECRET!,
    store: supabaseTokenStore,
  });
  gateway = new LiveShopifyGateway(
    createGraphqlClient({ shop, apiVersion: env.SHOPIFY_API_VERSION!, tokens }),
  );
  return gateway;
}
