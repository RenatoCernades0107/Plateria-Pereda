import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WhatsAppIcon } from "./whatsapp-icon";

describe("WhatsAppIcon", () => {
  it("es decorativo por defecto y toma el color del texto", () => {
    const { container } = render(<WhatsAppIcon className="size-4" />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("fill", "currentColor");
    expect(svg).toHaveAttribute("viewBox", "0 0 24 24");
    expect(svg).toHaveClass("size-4");
  });

  it("con aria-label se anuncia", () => {
    render(<WhatsAppIcon role="img" aria-label="WhatsApp" />);
    expect(screen.getByRole("img", { name: "WhatsApp" })).not.toHaveAttribute(
      "aria-hidden",
    );
  });
});
