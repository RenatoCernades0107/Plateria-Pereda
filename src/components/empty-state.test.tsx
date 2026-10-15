import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FilteredEmptyState } from "./empty-state";

describe("FilteredEmptyState", () => {
  it("dice que no hubo resultados y ofrece restablecer los filtros", () => {
    render(<FilteredEmptyState resetHref="/piezas?vista=kanban" />);
    expect(
      screen.getByText("No encontramos resultados para tu búsqueda."),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Restablecer filtros" }),
    ).toHaveAttribute("href", "/piezas?vista=kanban");
  });
});
