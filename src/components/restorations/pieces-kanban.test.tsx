import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { BoardPiece } from "@/server/restorations/queries";

import { PiecesKanban } from "./pieces-kanban";

vi.mock("@/server/payments/actions", () => ({
  approveWithPayment: vi.fn(),
  deliverWithBalance: vi.fn(),
}));
vi.mock("@/server/restorations/status-actions", () => ({
  changePieceStatus: vi.fn(),
  markPiecesArrived: vi.fn(),
  receiveFromWorkshop: vi.fn(),
  returnPiecesToClient: vi.fn(),
  assignWorkshop: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const piece = (n: number, patch: Partial<BoardPiece> = {}): BoardPiece => ({
  id: `p${n}`,
  code: `RES-00001-${n}`,
  restorationId: "r1",
  restorationCode: "RES-00001",
  clientName: "María Fernández Rojas",
  description: `Pieza ${n}`,
  status: "enviada_taller",
  location: "en_taller",
  urgent: false,
  readyForDelivery: false,
  returnedAt: null,
  workshopId: "w1",
  workshopName: "Taller Huamán",
  arrivedAt: null,
  workshopDays: 0,
  workshopOngoing: false,
  lastObservation: null,
  serviceName: "",
  materialName: "",
  measure: "",
  weightGrams: null,
  serviceCostCents: null,
  priceCents: null,
  hasOrder: false,
  photoUrl: null,
  statusDays: 0,
  ...patch,
});

const renderKanban = (pieces: BoardPiece[]) =>
  render(
    <PiecesKanban
      pieces={pieces}
      role="admin"
      workshops={[{ id: "w1", name: "Taller Huamán" }]}
    />,
  );

describe("PiecesKanban: tiempos de la tarjeta", () => {
  it("muestra los días en el estado y en el taller como datos separados", () => {
    renderKanban([piece(1, { statusDays: 10, workshopDays: 9 })]);
    const row = within(screen.getByTestId("tarjeta-RES-00001-1")).getByTestId(
      "tiempos-pieza",
    );
    const age = within(row).getByTestId("dias-en-estado");
    const workshop = within(row).getByTestId("dias-en-taller");
    expect(age).toHaveTextContent("10 días en este estado");
    expect(age).toHaveAttribute("data-tone", "attention");
    expect(workshop).toHaveTextContent(/^9 días en taller$/);
    expect(row).toHaveClass("flex", "flex-wrap");
  });

  it("resalta la pieza con muchos días en el taller", () => {
    renderKanban([
      piece(1, { statusDays: 2, workshopDays: 30, workshopOngoing: true }),
    ]);
    const workshop = screen.getByTestId("dias-en-taller");
    expect(workshop).toHaveTextContent("30 días en taller (en curso)");
    expect(workshop).toHaveClass("text-destructive");
    expect(
      within(workshop).getByLabelText("Muchos días en el taller"),
    ).toBeInTheDocument();
  });

  it("sin días en taller solo muestra los días en el estado", () => {
    renderKanban([piece(1, { status: "registrada", location: "sin_enviar" })]);
    expect(screen.getByTestId("dias-en-estado")).toHaveTextContent(
      "Hoy en este estado",
    );
    expect(screen.queryByTestId("dias-en-taller")).not.toBeInTheDocument();
  });
});
