import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Loading from "./loading";

describe("loading de las secciones", () => {
  it("anuncia la carga a los lectores de pantalla", () => {
    render(<Loading />);
    expect(screen.getByRole("status")).toHaveTextContent("Cargando…");
  });
});
