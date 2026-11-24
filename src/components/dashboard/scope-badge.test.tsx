import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { dashboardScopes } from "@/domain/dashboard-scope";

import { ScopeBadge, ScopeBadges, ScopeLegend } from "./scope-badge";

const TODAY = "2026-11-24";
const scopes = dashboardScopes({ from: "2026-11-01", to: TODAY }, TODAY);
const closed = dashboardScopes({ from: "2026-10-01", to: "2026-10-31" }, TODAY);

describe("ScopeBadge", () => {
  it("periodo que llega a hoy: muestra el rango y «hasta hoy»", () => {
    render(<ScopeBadge scope={scopes.periodo} />);
    const badge = screen.getByTestId("scope");
    expect(badge).toHaveAttribute("data-scope", "periodo");
    expect(badge).toHaveTextContent("1 nov – 24 nov 2026");
    expect(badge).toHaveTextContent("hasta hoy");
    // El lector de pantalla oye qué tipo de dato es, no solo el color.
    expect(badge).toHaveTextContent("Periodo:");
    expect(badge).toHaveAttribute(
      "title",
      expect.stringContaining("hasta hoy"),
    );
  });

  it("periodo cerrado: sin «hasta hoy»", () => {
    render(<ScopeBadge scope={closed.periodo} />);
    expect(screen.getByTestId("scope")).toHaveTextContent(
      "1 oct – 31 oct 2026",
    );
    expect(screen.getByTestId("scope")).not.toHaveTextContent("hasta hoy");
  });

  it("cohorte: el rango con «estado actual»", () => {
    render(<ScopeBadge scope={closed.cohorte} />);
    const badge = screen.getByTestId("scope");
    expect(badge).toHaveAttribute("data-scope", "cohorte");
    expect(badge).toHaveTextContent("1 oct – 31 oct 2026");
    expect(badge).toHaveTextContent("estado actual");
  });

  it("hoy: «Al día de hoy» aunque el rango sea otro, con su matiz", () => {
    render(<ScopeBadge scope={closed.hoy} />);
    const badge = screen.getByTestId("scope");
    expect(badge).toHaveAttribute("data-scope", "hoy");
    expect(badge).toHaveTextContent("Al día de hoy");
    expect(badge).toHaveTextContent("no cambia con el periodo");
    expect(badge).not.toHaveTextContent("oct");
  });

  it("compacto: «hoy» pierde el matiz largo pero conserva el aviso accesible", () => {
    render(<ScopeBadge scope={scopes.hoy} compact />);
    const badge = screen.getByTestId("scope");
    expect(badge).toHaveTextContent("Al día de hoy");
    expect(badge).not.toHaveTextContent("no cambia con el periodo");
    expect(badge).toHaveAttribute(
      "title",
      expect.stringContaining("no cambia con el periodo"),
    );
  });

  it("el icono es decorativo", () => {
    render(<ScopeBadge scope={scopes.periodo} />);
    expect(screen.getByTestId("scope").querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });
});

describe("ScopeBadges", () => {
  it("acepta uno o varios alcances (tablas mixtas)", () => {
    const { rerender } = render(<ScopeBadges scope={scopes.periodo} />);
    expect(screen.getAllByTestId("scope")).toHaveLength(1);
    rerender(<ScopeBadges scope={[scopes.periodo, scopes.hoy]} />);
    expect(screen.getAllByTestId("scope").map((b) => b.dataset.scope)).toEqual([
      "periodo",
      "hoy",
    ]);
  });
});

describe("ScopeLegend", () => {
  it("explica los tres alcances", () => {
    render(<ScopeLegend />);
    const legend = screen.getByTestId("rango-leyenda");
    expect(legend).toHaveTextContent("Periodo");
    expect(legend).toHaveTextContent("Estado actual");
    expect(legend).toHaveTextContent("Hoy");
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });
});
