import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { BoardPiece } from "@/server/restorations/queries";

import { PiecesBoardTable } from "./pieces-board-table";

vi.mock("@/server/restorations/status-actions", () => ({
  changePieceStatus: vi.fn(),
  markPiecesArrived: vi.fn(),
  assignWorkshop: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const base: BoardPiece = {
  id: "p1",
  code: "RES-00001-1",
  restorationId: "r1",
  restorationCode: "RES-00001",
  clientName: "Ana Pérez",
  description: "Fuente",
  status: "recibida",
  location: "en_tienda",
  workshopId: null,
  workshopName: null,
  arrivedAt: "2026-10-01T15:00:00Z",
  workshopDays: 0,
  workshopOngoing: false,
  lastObservation: null,
};

describe("PiecesBoardTable", () => {
  it("resalta las piezas con muchos días en el taller y muestra la última observación", () => {
    render(
      <PiecesBoardTable
        role="logistica"
        workshops={[]}
        pieces={[
          base,
          {
            ...base,
            id: "p2",
            code: "RES-00001-2",
            status: "enviada_taller",
            location: "en_taller",
            workshopName: "Taller Central",
            workshopDays: 9,
            workshopOngoing: true,
            lastObservation: "Falta pulir",
          },
        ]}
      />,
    );
    const slow = screen.getByTestId("pieza-RES-00001-2");
    expect(
      within(slow).getByLabelText("Muchos días en el taller"),
    ).toBeInTheDocument();
    expect(slow).toHaveTextContent("9 días (en curso)");
    expect(slow).toHaveTextContent("Última observación: Falta pulir");
    expect(
      within(screen.getByTestId("pieza-RES-00001-1")).queryByLabelText(
        "Muchos días en el taller",
      ),
    ).toBeNull();
    expect(screen.getByRole("link", { name: "RES-00001-1" })).toHaveAttribute(
      "href",
      "/restauraciones/r1",
    );
  });

  it("elige todas las piezas de la página y ofrece las acciones comunes", async () => {
    const user = userEvent.setup();
    render(
      <PiecesBoardTable
        role="logistica"
        workshops={[]}
        pieces={[base, { ...base, id: "p2", code: "RES-00001-2" }]}
      />,
    );
    await user.click(screen.getByLabelText("Elegir todas las de esta página"));
    const bar = screen.getByRole("region", {
      name: "Acciones para las piezas elegidas",
    });
    expect(bar).toHaveTextContent("2 piezas elegidas");
    expect(
      within(bar).getByRole("button", { name: "Enviar al taller" }),
    ).toBeInTheDocument();
  });

  it("sin piezas muestra un mensaje", () => {
    render(<PiecesBoardTable role="logistica" workshops={[]} pieces={[]} />);
    expect(
      screen.getByText("No hay piezas con esos filtros."),
    ).toBeInTheDocument();
  });
});
