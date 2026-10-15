import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FilterChips } from "./filter-chips";

describe("FilterChips", () => {
  it("muestra el contador dentro de cada chip y el tono de alerta", () => {
    render(
      <FilterChips
        label="Mostrar solo"
        chips={[
          {
            key: "urgentes",
            label: "Urgentes",
            active: false,
            href: "/piezas?urgentes=1",
            tone: "alert",
            count: 3,
          },
          {
            key: "listas",
            label: "Listas para entregar",
            active: true,
            href: "/piezas",
            tone: "default",
            count: 5,
          },
        ]}
      />,
    );
    const urgent = screen.getByRole("link", { name: "Urgentes (3)" });
    expect(urgent).toHaveAttribute("data-tone", "alert");
    expect(urgent).toHaveClass("bg-red-50");
    const ready = screen.getByRole("link", {
      name: "Listas para entregar (5)",
    });
    expect(ready).toHaveAttribute("aria-current", "true");
  });

  it("sin dato no muestra contador", () => {
    render(
      <FilterChips
        chips={[
          {
            key: "x",
            label: "De WhatsApp",
            active: false,
            href: "/r",
            tone: "default",
          },
        ]}
      />,
    );
    expect(screen.getByRole("link", { name: "De WhatsApp" })).toBeVisible();
    expect(screen.queryByTestId("contador")).toBeNull();
  });
});
