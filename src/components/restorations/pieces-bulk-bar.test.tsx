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
