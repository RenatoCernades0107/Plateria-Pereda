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

  it("el admin define un precio que falta con el botón «Definir precio»", () => {
    render(
      <PieceMoneyTiles
        piece={piece}
        sale={{
          cents: null,
          hasOrder: false,
          editable: true,
          pricesIncludeIgv: true,
        }}
        costCents={undefined}
        guide={null}
      />,
    );
    expect(
      within(tile("Precio de venta")).getByRole("button", {
        name: "Editar precio de venta de RES-00001-1",
      }),
    ).toHaveTextContent("Definir precio");
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
    // Sin costo: un botón "Definir costo" (acción visible), no el texto "Por definir".
    expect(
      within(tile("Costo de servicio")).getByRole("button", {
        name: "Editar costo de servicio de RES-00001-1",
      }),
    ).toHaveTextContent("Definir costo");
    expect(tile("Costo de servicio")).not.toHaveTextContent("Por definir");
    expect(screen.queryByText("Precio de venta")).toBeNull();
    expect(screen.queryByText("Margen")).toBeNull();
    expect(screen.queryByTestId("saldo-guia")).toBeNull();
  });
});
