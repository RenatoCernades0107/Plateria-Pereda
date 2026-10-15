import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PiecesBulkBar } from "./pieces-bulk-bar";
import type { StatusPiece } from "./piece-status-actions";

vi.mock("@/server/restorations/status-actions", () => ({
  changePieceStatus: vi.fn(),
  markPiecesArrived: vi.fn(),
  receiveFromWorkshop: vi.fn(),
  returnPiecesToClient: vi.fn(),
  assignWorkshop: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const piece: StatusPiece = {
  id: "p1",
  code: "RES-00001-1",
  status: "aprobada",
  location: "sin_enviar",
  arrivedAt: "2026-10-01T15:00:00Z",
  workshopId: null,
  readyForDelivery: false,
  returnedAt: null,
  urgent: false,
};

describe("PiecesBulkBar · Asignar taller (D60)", () => {
  it("logística y el admin asignan el taller; ventas no", () => {
    for (const role of ["admin", "logistica", "ventas"] as const) {
      const { unmount } = render(
        <PiecesBulkBar
          restorationId="r1"
          chosen={[piece]}
          role={role}
          workshops={[{ id: "w1", name: "Taller Central" }]}
          onDone={() => {}}
        />,
      );
      const button = screen.queryByRole("button", { name: "Asignar taller" });
      if (role === "ventas") expect(button).toBeNull();
      else expect(button).toBeInTheDocument();
      unmount();
    }
  });
});

describe("PiecesBulkBar · barra compacta del detalle", () => {
  const renderBar = (chosen: StatusPiece[]) =>
    render(
      <PiecesBulkBar
        restorationId="r1"
        chosen={chosen}
        role="admin"
        workshops={[]}
        onDone={() => {}}
        statusPicker
        total={3}
      />,
    );

  it("con un cambio común muestra el selector y 'Aplicar a N piezas'", () => {
    renderBar([piece, { ...piece, id: "p2", code: "RES-00001-2" }]);
    expect(screen.getByText(/2 piezas elegidas/)).toBeInTheDocument();
    expect(screen.getByLabelText("Cambiar estado a…")).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Aplicar a 2 piezas" }),
    ).toBeDisabled();
  });

  it("sin cambio común oculta el selector y el botón y deja un aviso corto", () => {
    renderBar([piece, { ...piece, id: "p2", status: "anulada" }]);
    expect(screen.getByText(/2 piezas elegidas/)).toBeInTheDocument();
    expect(
      screen.getByText("Sin cambio de estado en común"),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Cambiar estado a…")).toBeNull();
    expect(screen.queryByRole("button", { name: /Aplicar/ })).toBeNull();
  });
});
