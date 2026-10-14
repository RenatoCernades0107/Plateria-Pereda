import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SHOPIFY_BADGE_CLASS, ShopifyBadge } from "./shopify-badge";

describe("ShopifyBadge", () => {
  it("lleva el logotipo y el verde de Shopify sin cambiar el texto", () => {
    render(<ShopifyBadge data-testid="insignia">Orden #1001</ShopifyBadge>);
    const badge = screen.getByTestId("insignia");
    expect(badge).toHaveTextContent(/^Orden #1001$/);
    expect(badge.querySelector('svg[data-icon="shopify"]')).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    for (const cls of SHOPIFY_BADGE_CLASS.split(" "))
      expect(badge).toHaveClass(cls);
  });

  it("las clases propias pueden reemplazar el tinte", () => {
    render(
      <ShopifyBadge data-testid="insignia" className="bg-transparent">
        Pendiente
      </ShopifyBadge>,
    );
    const badge = screen.getByTestId("insignia");
    expect(badge).toHaveClass("bg-transparent");
    expect(badge).not.toHaveClass("bg-shopify/15");
  });
});
