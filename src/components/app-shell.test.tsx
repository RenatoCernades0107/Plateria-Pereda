import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { NAV_ITEMS } from "@/lib/navigation";

import { AppShell } from "./app-shell";
import { PageBreadcrumb } from "./page-breadcrumb";

vi.mock("next/navigation", () => ({
  usePathname: () => "/restauraciones/123",
}));
vi.mock("@/server/auth-actions", () => ({ logout: vi.fn() }));
vi.mock("@/components/alerts/alerts-bell", () => ({
  AlertsBell: () => <button type="button">Alertas</button>,
}));

const user = {
  id: "u-1",
  fullName: "Vera Ventas",
  email: "ventas@pereda.test",
  role: "ventas" as const,
};

describe("AppShell", () => {
  it("muestra la campana de alertas en el encabezado", () => {
    render(<AppShell user={user}>contenido</AppShell>);
    expect(screen.getByRole("button", { name: "Alertas" })).toBeVisible();
  });

  it.each([
    ["admin", NAV_ITEMS.map((i) => i.title)],
    [
      "ventas",
      [
        "Dashboard",
        "Restauraciones",
        "Piezas",
        "Cotizaciones de WhatsApp",
        "Clientes",
        "Cotizaciones",
      ],
    ],
    ["logistica", ["Restauraciones", "Piezas", "Cotizaciones", "Talleres"]],
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

  it("Cotizaciones de WhatsApp lleva el ícono verde de WhatsApp", () => {
    render(<AppShell user={user}>contenido</AppShell>);
    const nav = screen.getByRole("list", { name: "Navegación principal" });
    const icon = within(nav)
      .getByRole("link", { name: "Cotizaciones de WhatsApp" })
      .querySelector("svg[data-icon=whatsapp]");
    expect(icon).toHaveClass("text-whatsapp-strong");
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

  it("en un detalle muestra la sección como enlace y el código del registro", () => {
    render(
      <AppShell user={user}>
        <PageBreadcrumb label="RES-00012" />
      </AppShell>,
    );
    const crumbs = screen.getByRole("navigation", {
      name: "Ruta de navegación",
    });
    expect(
      within(crumbs).getByRole("link", { name: "Restauraciones" }),
    ).toHaveAttribute("href", "/restauraciones");
    expect(
      within(crumbs).getByText("RES-00012", {
        selector: "[data-slot=breadcrumb-page]",
      }),
    ).toBeInTheDocument();
  });

  it("muestra el contenido de la página", () => {
    render(<AppShell user={user}>contenido de prueba</AppShell>);
    expect(screen.getByRole("main")).toHaveTextContent("contenido de prueba");
  });

  it("el primer Tab ofrece saltar el menú hasta el contenido", async () => {
    render(<AppShell user={user}>contenido de prueba</AppShell>);
    await userEvent.tab();
    const skip = screen.getByRole("link", { name: "Saltar al contenido" });
    expect(skip).toHaveFocus();
    expect(skip).toHaveAttribute("href", "#contenido");
    expect(document.getElementById("contenido")).toHaveTextContent(
      "contenido de prueba",
    );
  });

  it("muestra el nombre y el rol del usuario conectado", () => {
    render(<AppShell user={user}>contenido</AppShell>);
    const boton = screen.getByRole("button", { name: /Vera Ventas/ });
    expect(boton).toHaveTextContent("Ventas");
  });
});
