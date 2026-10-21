import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { navigateRow } from "./clickable-row";
import { useDragScroll } from "./use-drag-scroll";

function Scroller({ onRow }: { onRow: () => void }) {
  const ref = useDragScroll<HTMLDivElement>();
  return (
    <div ref={ref} data-testid="contenedor">
      <table>
        <tbody>
          <tr onClick={navigateRow}>
            <td data-testid="celda">Texto</td>
            <td>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- solo hace falta un <a>. */}
              <a
                href="/piezas/p1"
                data-primary-link
                onClick={(e) => {
                  e.preventDefault();
                  onRow();
                }}
              >
                P-1
              </a>
            </td>
            <td>
              <button type="button">Editar</button>
            </td>
            <td>
              <article data-no-drag-scroll="" data-testid="tarjeta">
                Tarjeta
              </article>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** jsdom no mide: se simula un contenido más ancho que el contenedor. */
function setup({ overflow = true } = {}) {
  const onRow = vi.fn();
  render(<Scroller onRow={onRow} />);
  const box = screen.getByTestId("contenedor");
  Object.defineProperty(box, "clientWidth", { value: 300 });
  Object.defineProperty(box, "scrollWidth", { value: overflow ? 900 : 300 });
  box.scrollLeft = 100;
  return { box, onRow };
}

const mouse = { pointerType: "mouse", button: 0 };

function drag(from: Element, dx: number) {
  fireEvent.pointerDown(from, { ...mouse, clientX: 200 });
  fireEvent.pointerMove(window, { ...mouse, clientX: 200 + dx });
  fireEvent.pointerUp(window, { ...mouse, clientX: 200 + dx });
}

describe("useDragScroll", () => {
  it("arrastrar el fondo desplaza de lado", () => {
    const { box } = setup();
    drag(screen.getByTestId("celda"), -60);
    expect(box.scrollLeft).toBe(160);
  });

  it("no arrastra desde un botón ni desde una tarjeta", () => {
    const { box } = setup();
    drag(screen.getByRole("button", { name: "Editar" }), -60);
    drag(screen.getByTestId("tarjeta"), -60);
    expect(box.scrollLeft).toBe(100);
  });

  it("sin desborde horizontal no hace nada", () => {
    const { box } = setup({ overflow: false });
    drag(screen.getByTestId("celda"), -60);
    expect(box.scrollLeft).toBe(100);
  });

  it("ignora el táctil (ya se desplaza solo)", () => {
    const { box } = setup();
    const celda = screen.getByTestId("celda");
    fireEvent.pointerDown(celda, { pointerType: "touch", clientX: 200 });
    fireEvent.pointerMove(window, { pointerType: "touch", clientX: 100 });
    expect(box.scrollLeft).toBe(100);
  });

  it("el clic que sigue a un arrastre no abre la fila", () => {
    const { onRow } = setup();
    const celda = screen.getByTestId("celda");
    drag(celda, -60);
    fireEvent.click(celda);
    expect(onRow).not.toHaveBeenCalled();
  });

  it("también arrastra desde un enlace, sin abrirlo ni el arrastre nativo", () => {
    const { box, onRow } = setup();
    const link = screen.getByRole("link", { name: "P-1" });
    drag(link, -60);
    expect(box.scrollLeft).toBe(160);
    fireEvent.click(link);
    expect(onRow).not.toHaveBeenCalled();
    // El arrastre nativo del navegador (enlaces, imágenes) se anula.
    expect(fireEvent.dragStart(link)).toBe(false);
  });

  it("avisa si queda contenido a la derecha (sin barra, se desvanece el borde)", () => {
    const { box } = setup();
    fireEvent.scroll(box);
    expect(box).toHaveAttribute("data-more-right");
    box.scrollLeft = 600;
    fireEvent.scroll(box);
    expect(box).not.toHaveAttribute("data-more-right");
  });

  it("un movimiento chico sigue siendo un clic", () => {
    const { box, onRow } = setup();
    const celda = screen.getByTestId("celda");
    drag(celda, 3);
    fireEvent.click(celda);
    expect(onRow).toHaveBeenCalledOnce();
    expect(box.scrollLeft).toBe(100);
  });
});
