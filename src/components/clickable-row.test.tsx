import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ClickableRow } from "./clickable-row";

function renderRow(onLink = vi.fn(), onBox = vi.fn()) {
  render(
    <table>
      <tbody>
        <ClickableRow data-testid="fila">
          <td>
            <input type="checkbox" aria-label="Elegir" onChange={onBox} />
          </td>
          <td>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- el componente solo necesita un <a>. */}
            <a
              href="/piezas/p1"
              data-primary-link
              onClick={(e) => {
                e.preventDefault();
                onLink();
              }}
            >
              P-1
            </a>
          </td>
          <td>Texto de la celda</td>
          <td>
            <button type="button">Editar</button>
          </td>
        </ClickableRow>
      </tbody>
    </table>,
  );
  return { onLink, onBox };
}

describe("ClickableRow (S3)", () => {
  it("el clic en cualquier celda abre el enlace principal", () => {
    const { onLink } = renderRow();
    fireEvent.click(screen.getByText("Texto de la celda"));
    expect(onLink).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: "P-1" })).toHaveAttribute(
      "href",
      "/piezas/p1",
    );
  });

  it("no navega al usar checkboxes ni botones de la fila", () => {
    const { onLink } = renderRow();
    fireEvent.click(screen.getByRole("checkbox", { name: "Elegir" }));
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    expect(onLink).not.toHaveBeenCalled();
  });

  it("el clic en el enlace navega una sola vez", () => {
    const { onLink } = renderRow();
    fireEvent.click(screen.getByRole("link", { name: "P-1" }));
    expect(onLink).toHaveBeenCalledTimes(1);
  });
});
