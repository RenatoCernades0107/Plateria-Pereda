import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { PieceDetail } from "@/server/restorations/queries";

import { PiecesBoard } from "./pieces-board";

vi.mock("@/server/restorations/status-actions", () => ({
  changePieceStatus: vi.fn(),
  markPiecesArrived: vi.fn(),
  receiveFromWorkshop: vi.fn(),
  returnPiecesToClient: vi.fn(),
  assignWorkshop: vi.fn(),
}));
vi.mock("@/server/restorations/actions", () => ({}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const piece = (n: number, patch: Partial<PieceDetail> = {}): PieceDetail => ({
  id: `p${n}`,
  number: n,
  code: `RES-00001-${n}`,
  status: "registrada",
  location: "sin_enviar",
  urgent: false,
  readyForDelivery: false,
  description: `Pieza ${n}`,
  measure: "",
  materialName: "",
  serviceName: "",
  weightGrams: null,
  workshopId: null,
  workshopName: null,
  materialId: null,
  serviceId: null,
  notes: "",
  arrivedAt: null,
  createdAt: "2026-10-01T15:00:00Z",
  deliveredAt: null,
  returnedAt: null,
  priceCents: null,
  ...patch,
});

const renderBoard = () =>
  render(
    <PiecesBoard
      restorationId="r1"
      role="ventas"
      workshops={[]}
      editing={null}
      pieces={[piece(1), piece(2), piece(3)]}
    />,
  );

const bar = () =>
  screen.getByRole("region", { name: "Acciones para las piezas elegidas" });

describe("PiecesBoard: cambio de estado masivo", () => {
  it("empieza con todas las piezas elegidas y el selector de estado visible", () => {
    renderBoard();
    expect(bar()).toHaveTextContent("3 piezas elegidas");
    expect(screen.getByLabelText("Elegir RES-00001-1")).toBeChecked();
    expect(screen.getByLabelText("Elegir RES-00001-3")).toBeChecked();
    expect(screen.getByLabelText("Elegir todas las piezas")).toBeChecked();
    expect(within(bar()).getByLabelText("Cambiar estado a…")).toBeEnabled();
    expect(
      within(bar()).getByRole("button", { name: "Aplicar a 3 piezas" }),
    ).toBeDisabled();
  });

  it("desmarcar una pieza actualiza el conteo y 'todas' la vuelve a marcar", async () => {
    const user = userEvent.setup();
    renderBoard();
    await user.click(screen.getByLabelText("Elegir RES-00001-2"));
    expect(bar()).toHaveTextContent("2 piezas elegidas");
    expect(screen.getByLabelText("Elegir todas las piezas")).not.toBeChecked();

    await user.click(screen.getByLabelText("Elegir todas las piezas"));
    expect(bar()).toHaveTextContent("3 piezas elegidas");

    await user.click(screen.getByLabelText("Elegir todas las piezas"));
    expect(bar()).toHaveTextContent("0 piezas elegidas");
    expect(within(bar()).getByLabelText("Cambiar estado a…")).toBeDisabled();
  });
});
