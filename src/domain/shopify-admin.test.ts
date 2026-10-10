import { describe, expect, it } from "vitest";

import { shopifyAdminOrderUrl } from "./shopify-admin";

describe("shopifyAdminOrderUrl", () => {
  it("arma el enlace al admin con la tienda y el número de la orden", () => {
    expect(
      shopifyAdminOrderUrl(
        "plateria-pereda.myshopify.com",
        "gid://shopify/Order/5551234",
      ),
    ).toBe("https://admin.shopify.com/store/plateria-pereda/orders/5551234");
  });

  it("sin tienda (modo fake) o sin orden no hay enlace", () => {
    expect(shopifyAdminOrderUrl(undefined, "gid://shopify/Order/1")).toBeNull();
    expect(shopifyAdminOrderUrl("t.myshopify.com", null)).toBeNull();
    expect(
      shopifyAdminOrderUrl("t.myshopify.com", "gid://shopify/Customer/1"),
    ).toBeNull();
  });
});
