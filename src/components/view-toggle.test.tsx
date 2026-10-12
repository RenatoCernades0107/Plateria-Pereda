import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ViewToggle } from "./view-toggle";

describe("ViewToggle", () => {
  it("por defecto ofrece Tabla y Kanban y marca la vista actual", () => {
    render(
      <ViewToggle
        view="tabla"
        tableHref="/piezas"
        kanbanHref="/piezas?vista=kanban"
      />,
    );
    const nav = screen.getByRole("navigation", { name: "Vista" });
    const table = within(nav).getByRole("link", { name: "Tabla" });
    const kanban = within(nav).getByRole("link", { name: "Kanban" });
    expect(table).toHaveAttribute("href", "/piezas");
    expect(table).toHaveAttribute("aria-current", "page");
    expect(kanban).toHaveAttribute("href", "/piezas?vista=kanban");
    expect(kanban).not.toHaveAttribute("aria-current");
  });

  it("acepta otro nombre para la vista no kanban", () => {
    render(
      <ViewToggle
        view="kanban"
        tableLabel="Lista"
        tableHref="/restauraciones/r1"
        kanbanHref="/restauraciones/r1?vista=kanban"
      />,
    );
    expect(screen.getByRole("link", { name: "Lista" })).toHaveAttribute(
      "href",
      "/restauraciones/r1",
    );
    expect(screen.queryByRole("link", { name: "Tabla" })).toBeNull();
    expect(screen.getByRole("link", { name: "Kanban" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
