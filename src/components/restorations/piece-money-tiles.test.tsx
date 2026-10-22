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
  it("admin: precio, costo, margen y saldo de la guía", () => {
    render(
      <PieceMoneyTiles
        piece={piece}
        sale={{ cents: 10_000, hasOrder: false, editable: true }}
        costCents={4_000}
        guide={{ totalCents: 20_000, paidCents: 5_000 }}
      />,
    );
    expect(tile("Precio de venta")).not.toHaveTextContent(/IGV/i);
    // 100.00 de precio menos 40.00 de costo.
    expect(within(tile("Margen")).getByText(/60\.00/)).toBeInTheDocument();
    expect(screen.getByTestId("saldo-guia")).toHaveTextContent("150.00");
  });

  it("con varias unidades: importe con techo, costo c/u y margen sobre el total", () => {
    render(
      <PieceMoneyTiles
        piece={piece}
        sale={{ cents: 2_666, hasOrder: false, editable: true }}
        costCents={3_000}
        quantity={3}
        guide={null}
      />,
    );
    // 3 × 26.66 = 79.98 sube a 80.00; el precio por unidad va debajo.
    expect(tile("Precio de venta")).toHaveTextContent("S/ 80.00");
    expect(tile("Precio de venta")).toHaveTextContent("S/ 26.66 c/u");
    // El costo es de la pieza completa; el c/u es solo referencia.
    expect(tile("Costo de servicio")).toHaveTextContent("S/ 30.00");
    expect(tile("Costo de servicio")).toHaveTextContent("S/ 10.00 c/u");
    // 80.00 − 30.00 = 50.00 (16.67 por unidad).
    expect(tile("Margen")).toHaveTextContent("S/ 50.00");
    expect(tile("Margen")).toHaveTextContent(
      "S/ 16.67 c/u · Venta total − costo",
    );
  });

  it("con varias unidades y la orden creada, «Cambiar precio» edita el unitario", () => {
    render(
      <PieceMoneyTiles
        piece={piece}
        sale={{ cents: 2_666, hasOrder: true, editable: true }}
        costCents={undefined}
        quantity={3}
        guide={null}
      />,
    );
    expect(tile("Precio de venta")).toHaveTextContent("S/ 80.00");
    expect(tile("Precio de venta")).toHaveTextContent("S/ 26.66 c/u");
  });

  it("el admin define un precio que falta con el botón «Definir precio»", () => {
    render(
      <PieceMoneyTiles
        piece={piece}
        sale={{ cents: null, hasOrder: false, editable: true }}
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

  it("logística: precio de venta (editable) y costo, sin margen ni saldo", () => {
    render(
      <PieceMoneyTiles
        piece={piece}
        sale={{ cents: 10_000, hasOrder: false, editable: true }}
        costCents={4_000}
        showMargin={false}
        guide={null}
      />,
    );
    expect(tile("Precio de venta")).toHaveTextContent("100.00");
    expect(
      within(tile("Precio de venta")).getByRole("button", {
        name: "Editar precio de venta de RES-00001-1",
      }),
    ).toBeInTheDocument();
    expect(tile("Costo de servicio")).toHaveTextContent("40.00");
    expect(screen.queryByText("Margen")).toBeNull();
    expect(screen.queryByTestId("saldo-guia")).toBeNull();
  });

  it("sin precio de venta: solo el costo de servicio", () => {
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
