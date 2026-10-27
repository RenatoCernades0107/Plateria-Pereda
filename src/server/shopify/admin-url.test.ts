import { describe, expect, it } from "vitest";

import { shopifyOrderAdminUrl } from "./admin-url";

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
