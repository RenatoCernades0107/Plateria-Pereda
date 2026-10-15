import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PieceMoneyTiles } from "./piece-money-tiles";

vi.mock("@/server/sale-price-actions", () => ({ setPieceSalePrice: vi.fn() }));
vi.mock("@/server/service-cost-actions", () => ({
  setPieceServiceCost: vi.fn(),
}));
vi.mock("@/server/restorations/status-actions", () => ({
  changePiecePrice: vi.fn(),
}));

const piece = { id: "p1", code: "RES-00001-1", restorationId: "r1" };
const tile = (label: string) =>
  screen.getByText(label, { selector: "dt" }).parentElement!;

describe("PieceMoneyTiles", () => {
  it("admin: precio, costo, margen sin IGV y saldo de la guía", () => {
    render(
      <PieceMoneyTiles
        piece={piece}
        sale={{
          cents: 11_800,
          hasOrder: false,
          editable: true,
          pricesIncludeIgv: true,
        }}
        costCents={4_000}
        guide={{ totalCents: 20_000, paidCents: 5_000 }}
      />,
    );
    expect(tile("Precio de venta")).toHaveTextContent("IGV incluido");
    // 118.00 con IGV → 100.00 de base; menos 40.00 de costo.
    expect(within(tile("Margen")).getByText(/60\.00/)).toBeInTheDocument();
    expect(screen.getByTestId("saldo-guia")).toHaveTextContent("150.00");
  });

  it("logística: solo el costo de servicio", () => {
    render(
      <PieceMoneyTiles
        piece={piece}
        sale={null}
        costCents={null}
        guide={null}
      />,
    );
    expect(tile("Costo de servicio")).toHaveTextContent("Por definir");
    expect(screen.queryByText("Precio de venta")).toBeNull();
    expect(screen.queryByText("Margen")).toBeNull();
    expect(screen.queryByTestId("saldo-guia")).toBeNull();
  });
});
