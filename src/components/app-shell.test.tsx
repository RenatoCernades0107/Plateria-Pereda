import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { NAV_ITEMS } from "@/lib/navigation";

import { AppShell } from "./app-shell";

vi.mock("next/navigation", () => ({
  usePathname: () => "/restauraciones/123",
}));

describe("AppShell", () => {
  it("renderiza un enlace por cada módulo", () => {
    render(<AppShell>contenido</AppShell>);
    const nav = screen.getByRole("list", { name: "Navegación principal" });
    for (const item of NAV_ITEMS) {
      expect(
        within(nav).getByRole("link", { name: item.title }),
      ).toHaveAttribute("href", item.href);
    }
  });

  it("marca el módulo actual y lo muestra en la ruta de navegación", () => {
    render(<AppShell>contenido</AppShell>);
    const nav = screen.getByRole("list", { name: "Navegación principal" });
    expect(
      within(nav).getByRole("link", { name: "Restauraciones" }),
    ).toHaveAttribute("data-active", "true");
    expect(within(nav).getByRole("link", { name: "Clientes" })).toHaveAttribute(
      "data-active",
      "false",
    );
    expect(
      screen.getByText("Restauraciones", {
        selector: "[data-slot=breadcrumb-page]",
      }),
    ).toBeInTheDocument();
  });

  it("muestra el contenido de la página", () => {
    render(<AppShell>contenido de prueba</AppShell>);
    expect(screen.getByRole("main")).toHaveTextContent("contenido de prueba");
  });
});
