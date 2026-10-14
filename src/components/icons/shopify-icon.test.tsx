import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ShopifyIcon } from "./shopify-icon";

describe("ShopifyIcon", () => {
  it("es decorativo por defecto y toma el color del texto", () => {
    const { container } = render(<ShopifyIcon className="size-4" />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("fill", "currentColor");
    expect(svg).toHaveAttribute("viewBox", "0 0 24 24");
    expect(svg).toHaveAttribute("data-icon", "shopify");
    expect(svg).toHaveClass("size-4");
  });

  it("con aria-label se anuncia", () => {
    render(<ShopifyIcon role="img" aria-label="Shopify" />);
    expect(screen.getByRole("img", { name: "Shopify" })).not.toHaveAttribute(
      "aria-hidden",
    );
  });
});
