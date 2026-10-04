import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { NAV_ITEMS } from "@/lib/navigation";

import { AppShell } from "./app-shell";

vi.mock("next/navigation", () => ({
  usePathname: () => "/restauraciones/123",
}));
vi.mock("@/server/auth-actions", () => ({ logout: vi.fn() }));

const user = {
  fullName: "Vera Ventas",
  email: "ventas@pereda.test",
  role: "ventas" as const,
};

describe("AppShell", () => {
  it.each([
    ["admin", NAV_ITEMS.map((i) => i.title)],
    [
      "ventas",
      ["Dashboard", "Restauraciones", "Piezas", "Clientes", "Cotizaciones"],
    ],
    ["logistica", ["Restauraciones", "Piezas", "Clientes", "Talleres"]],
  ] as const)("muestra a %s solo los módulos permitidos", (role, visibles) => {
    render(<AppShell user={{ ...user, role }}>contenido</AppShell>);
    const nav = screen.getByRole("list", { name: "Navegación principal" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(visibles);
    for (const link of links) {
      const item = NAV_ITEMS.find((i) => i.title === link.textContent);
      expect(link).toHaveAttribute("href", item?.href);
    }
  });

  it("marca el módulo actual y lo muestra en la ruta de navegación", () => {
    render(<AppShell user={user}>contenido</AppShell>);
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
    render(<AppShell user={user}>contenido de prueba</AppShell>);
    expect(screen.getByRole("main")).toHaveTextContent("contenido de prueba");
  });

  it("muestra el nombre y el rol del usuario conectado", () => {
    render(<AppShell user={user}>contenido</AppShell>);
    const boton = screen.getByRole("button", { name: /Vera Ventas/ });
    expect(boton).toHaveTextContent("Ventas");
  });
});
