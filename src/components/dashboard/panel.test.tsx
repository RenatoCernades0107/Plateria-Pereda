import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { dashboardScopes } from "@/domain/dashboard-scope";

import { Panel } from "./panel";

const TODAY = "2026-11-24";
const scopes = dashboardScopes({ from: "2026-11-01", to: TODAY }, TODAY);

describe("Panel", () => {
  it("muestra la etiqueta de tiempo junto al título, sin ensuciar el nombre del encabezado", () => {
    render(
      <Panel title="Vendido y cobrado" scope={scopes.periodo} testId="panel">
        <p>contenido</p>
      </Panel>,
    );
    const region = screen.getByRole("region", { name: "Vendido y cobrado" });
    expect(
      within(region).getByRole("heading", { name: "Vendido y cobrado" }),
    ).toBeInTheDocument();
    const badge = within(region).getByTestId("scope");
    expect(badge).toHaveAttribute("data-scope", "periodo");
    expect(badge).toHaveTextContent("hasta hoy");
  });

  it("una tabla mixta lleva una etiqueta por alcance", () => {
    render(
      <Panel title="Detalle" scope={[scopes.periodo, scopes.hoy]}>
        <p>contenido</p>
      </Panel>,
    );
    expect(screen.getAllByTestId("scope")).toHaveLength(2);
  });

  it("sin `scope` no dibuja etiqueta", () => {
    render(
      <Panel title="Sin alcance">
        <p>contenido</p>
      </Panel>,
    );
    expect(screen.queryByTestId("scope")).toBeNull();
  });
});
