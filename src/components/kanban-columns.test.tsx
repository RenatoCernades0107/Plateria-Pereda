import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  KanbanCard,
  KanbanColumns,
  type KanbanCardDrag,
} from "./kanban-columns";
import { dropState } from "./kanban-drag";

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

const columns = [
  { key: "a", label: "Columna A", items: ["uno"] },
  { key: "b", label: "Columna B", items: [] as string[] },
  { key: "c", label: "Columna C", items: [] as string[] },
  { key: "d", label: "Solo destino", items: [] as string[], dropOnly: true },
];

const card = (item: string, drag?: KanbanCardDrag) => (
  <KanbanCard key={item} data-testid={`tarjeta-${item}`}>
    {item}
    {drag?.handle}
  </KanbanCard>
);

describe("KanbanColumns sin arrastrar", () => {
  it("no muestra asas ni las columnas de solo destino vacías", () => {
    render(
      <KanbanColumns
        label="Cosas"
        emptyText="Nada"
        columns={columns}
        renderCard={card}
      />,
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByTestId("columna-d")).toBeNull();
    expect(screen.getByTestId("columna-a")).not.toHaveAttribute("data-drop");
  });
});

describe("KanbanColumns con arrastrar", () => {
  const drag = {
    getId: (item: string) => item,
    getLabel: (item: string) => `Tarjeta ${item}`,
    canDrop: (_item: string, key: string) => key === "b" || key === "d",
    onMove: vi.fn(),
  };
  const renderDraggable = () =>
    render(
      <KanbanColumns
        label="Cosas"
        emptyText="Nada"
        columns={columns}
        renderCard={card}
        drag={drag}
      />,
    );

  it("da a cada tarjeta un asa accesible para el teclado", () => {
    renderDraggable();
    const handle = within(screen.getByTestId("tarjeta-uno")).getByRole(
      "button",
      { name: "Arrastrar Tarjeta uno" },
    );
    expect(handle).toHaveAttribute(
      "aria-roledescription",
      "tarjeta arrastrable",
    );
    expect(handle).toHaveAccessibleDescription(/pulsa espacio o Enter/);
    // Las columnas de solo destino no se ven hasta que se arrastra.
    expect(screen.queryByTestId("columna-d")).toBeNull();
  });

  it("al tomar la tarjeta con el teclado resalta solo las columnas permitidas", async () => {
    const user = userEvent.setup();
    renderDraggable();
    screen.getByRole("button", { name: "Arrastrar Tarjeta uno" }).focus();
    await user.keyboard("[Space]");

    expect(screen.getByTestId("columna-a")).toHaveAttribute(
      "data-drop",
      "origen",
    );
    expect(screen.getByTestId("columna-b")).toHaveAttribute(
      "data-drop",
      "permitida",
    );
    expect(screen.getByTestId("columna-c")).toHaveAttribute(
      "data-drop",
      "bloqueada",
    );
    // La de solo destino aparece porque la tarjeta puede ir ahí.
    expect(screen.getByTestId("columna-d")).toHaveAttribute(
      "data-drop",
      "permitida",
    );
    expect(await screen.findByText(/Tomaste Tarjeta uno/)).toHaveTextContent(
      "Puede ir a: Columna B, Solo destino.",
    );

    await user.keyboard("[Escape]");
    expect(screen.getByTestId("columna-b")).not.toHaveAttribute("data-drop");
    expect(screen.queryByTestId("columna-d")).toBeNull();
    expect(drag.onMove).not.toHaveBeenCalled();
  });
});

describe("dropState", () => {
  const drag = { canDrop: (_: string, key: string) => key === "b" };
  it("marca origen, permitidas y bloqueadas solo mientras se arrastra", () => {
    expect(dropState(drag, null, "a")).toBeUndefined();
    const active = { item: "uno", from: "a" };
    expect(dropState(drag, active, "a")).toBe("origen");
    expect(dropState(drag, active, "b")).toBe("permitida");
    expect(dropState(drag, active, "c")).toBe("bloqueada");
  });
});
