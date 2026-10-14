import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Badge } from "./badge";

describe("Badge", () => {
  it("una insignia informativa no parece pulsable", () => {
    render(<Badge variant="outline">Pagado</Badge>);
    const badge = screen.getByText("Pagado");
    expect(badge.tagName).toBe("SPAN");
    expect(badge).toHaveClass("cursor-default");
  });

  it("una insignia que es enlace se ve como enlace", () => {
    render(
      <Badge variant="outline" asChild>
        <a href="https://example.com/orden">Orden #1001</a>
      </Badge>,
    );
    const link = screen.getByRole("link", { name: "Orden #1001" });
    // El cursor normal de las insignias cede ante el de enlace y el subrayado.
    expect(link).toHaveClass("[a&]:cursor-pointer", "[a&]:hover:underline");
  });
});
