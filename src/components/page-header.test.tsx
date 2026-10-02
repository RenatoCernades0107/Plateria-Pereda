import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PageHeader } from "./page-header";

describe("PageHeader", () => {
  it("muestra el título y la descripción", () => {
    render(<PageHeader title="Clientes" description="Listado de clientes" />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Clientes" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Listado de clientes")).toBeInTheDocument();
  });

  it("omite la descripción si no se indica", () => {
    const { container } = render(<PageHeader title="Clientes" />);
    expect(container.querySelector("p")).toBeNull();
  });
});
