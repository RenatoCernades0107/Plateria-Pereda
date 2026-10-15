import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Pagination } from "./pagination";

const hrefFor = (page: number) => `/piezas?pagina=${page}`;

describe("Pagination", () => {
  it("muestra el total, la página y los dos enlaces en una página intermedia", () => {
    render(
      <Pagination
        page={2}
        pages={3}
        total={45}
        noun={["pieza", "piezas"]}
        hrefFor={hrefFor}
      />,
    );
    const nav = screen.getByRole("navigation", { name: "Paginación" });
    expect(nav).toHaveTextContent("45 piezas · Página 2 de 3");
    expect(screen.getByRole("link", { name: "Anterior" })).toHaveAttribute(
      "href",
      "/piezas?pagina=1",
    );
    expect(screen.getByRole("link", { name: "Siguiente" })).toHaveAttribute(
      "href",
      "/piezas?pagina=3",
    );
  });

  it("usa el singular y no ofrece enlaces con una sola página", () => {
    render(
      <Pagination
        page={1}
        pages={1}
        total={1}
        noun={["pieza", "piezas"]}
        hrefFor={hrefFor}
      />,
    );
    expect(screen.getByRole("navigation")).toHaveTextContent(
      "1 pieza · Página 1 de 1",
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
