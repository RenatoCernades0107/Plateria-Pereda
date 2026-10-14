import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { GuideEyebrow, PieceEyebrow, PiecesHeading } from "./guide-labels";

describe("rótulos de la guía y sus piezas", () => {
  it("la guía lleva el rótulo «Guía»", () => {
    render(<GuideEyebrow />);
    expect(screen.getByTestId("rotulo-guia")).toHaveTextContent(/^Guía$/);
  });

  it("cada pieza lleva «Pieza N» y su código", () => {
    render(<PieceEyebrow number={2} code="RES-00001-2" />);
    const label = screen.getByTestId("rotulo-pieza");
    expect(label).toHaveTextContent("Pieza 2 · RES-00001-2");
    expect(screen.getByText("RES-00001-2")).toBeInTheDocument();
  });

  it("el título de la lista dice cuántas piezas tiene la guía", () => {
    render(<PiecesHeading count={3} />);
    expect(
      screen.getByRole("heading", { level: 2, name: "Piezas de la guía (3)" }),
    ).toBeInTheDocument();
  });
});
