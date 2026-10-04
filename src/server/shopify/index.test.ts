import { beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({ value: {} as Record<string, string> }));

vi.mock("@/lib/env.server", () => ({ serverEnv: () => env.value }));
vi.mock("./token-store", () => ({ supabaseTokenStore: {} }));

describe("getShopifyGateway", () => {
  beforeEach(() => vi.resetModules());

  it("usa el adaptador fake con SHOPIFY_MODE=fake y lo reutiliza", async () => {
    env.value = { SHOPIFY_MODE: "fake" };
    const { getShopifyGateway } = await import("./index");
    const { FakeShopifyGateway } = await import("./fake");
    expect(getShopifyGateway()).toBeInstanceOf(FakeShopifyGateway);
    expect(getShopifyGateway()).toBe(getShopifyGateway());
  });

  it("usa el adaptador live con SHOPIFY_MODE=live", async () => {
    env.value = {
      SHOPIFY_MODE: "live",
      SHOPIFY_STORE_DOMAIN: "pereda.myshopify.com",
      SHOPIFY_CLIENT_ID: "id",
      SHOPIFY_CLIENT_SECRET: "secreto",
      SHOPIFY_API_VERSION: "2026-10",
    };
    const { getShopifyGateway } = await import("./index");
    const { LiveShopifyGateway } = await import("./live");
    expect(getShopifyGateway()).toBeInstanceOf(LiveShopifyGateway);
  });
});
