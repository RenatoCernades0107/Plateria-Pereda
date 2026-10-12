import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { KanbanCard, KanbanColumns } from "./kanban-columns";

describe("KanbanColumns", () => {
  it("muestra una columna con título y conteo por estado, y el texto de la vacía", () => {
    render(
      <KanbanColumns
        label="Cosas por estado"
        emptyText="Nada aquí"
        columns={[
          { key: "a", label: "Columna A", items: ["uno", "dos"] },
          { key: "b", label: "Columna B", items: [] },
        ]}
        renderCard={(item) => (
          <KanbanCard key={item} data-testid={`tarjeta-${item}`}>
            {item}
          </KanbanCard>
        )}
      />,
    );
    const list = screen.getByRole("list", { name: "Cosas por estado" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);

    const a = screen.getByTestId("columna-a");
    expect(a).toHaveAccessibleName("Columna A");
    expect(within(a).getByRole("heading")).toHaveTextContent("Columna A2");
    expect(within(a).getByTestId("tarjeta-uno")).toHaveTextContent("uno");
    expect(within(a).getByTestId("tarjeta-dos").tagName).toBe("ARTICLE");

    const b = screen.getByTestId("columna-b");
    expect(within(b).getByRole("heading")).toHaveTextContent("Columna B0");
    expect(b).toHaveTextContent("Nada aquí");
  });
});
