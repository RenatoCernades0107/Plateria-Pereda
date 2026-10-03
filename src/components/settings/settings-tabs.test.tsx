import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SettingsTabs } from "./settings-tabs";

vi.mock("next/navigation", () => ({
  usePathname: () => "/configuracion/servicios",
}));

describe("SettingsTabs", () => {
  it("muestra las secciones y marca la actual", () => {
    render(<SettingsTabs />);
    const links = screen.getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual([
      "Empresa",
      "Materiales",
      "Servicios",
      "Métodos de pago",
    ]);
    expect(screen.getByRole("link", { name: "Servicios" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Empresa" })).not.toHaveAttribute(
      "aria-current",
    );
  });
});
