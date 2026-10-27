import { describe, expect, it } from "vitest";

import { shopifyDraftOrderAdminUrl, shopifyOrderAdminUrl } from "./admin-url";

describe("shopifyOrderAdminUrl", () => {
  it("arma el enlace al admin con el número del id", () => {
    expect(
      shopifyOrderAdminUrl(
        "plateria-pereda.myshopify.com",
        "gid://shopify/Order/5551234",
      ),
    ).toBe("https://plateria-pereda.myshopify.com/admin/orders/5551234");
  });

  it("sin tienda (modo fake) o sin orden no hay enlace", () => {
    expect(shopifyOrderAdminUrl(undefined, "gid://shopify/Order/1")).toBeNull();
    expect(shopifyOrderAdminUrl("x.myshopify.com", null)).toBeNull();
    expect(
      shopifyOrderAdminUrl("x.myshopify.com", "gid://shopify/Customer/1"),
    ).toBeNull();
  });
});

describe("shopifyDraftOrderAdminUrl", () => {
  it("arma el enlace al borrador con el número del id", () => {
    expect(
      shopifyDraftOrderAdminUrl(
        "plateria-pereda.myshopify.com",
        "gid://shopify/DraftOrder/771",
      ),
    ).toBe("https://plateria-pereda.myshopify.com/admin/draft_orders/771");
  });

  it("sin tienda o sin borrador no hay enlace", () => {
    expect(
      shopifyDraftOrderAdminUrl(undefined, "gid://shopify/DraftOrder/1"),
    ).toBeNull();
    expect(shopifyDraftOrderAdminUrl("x.myshopify.com", null)).toBeNull();
  });
});
