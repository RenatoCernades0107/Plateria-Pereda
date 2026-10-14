import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { BoardPiece } from "@/server/restorations/queries";

import { PiecesBoardTable } from "./pieces-board-table";

vi.mock("@/server/restorations/status-actions", () => ({
  changePieceStatus: vi.fn(),
  markPiecesArrived: vi.fn(),
  receiveFromWorkshop: vi.fn(),
  returnPiecesToClient: vi.fn(),
  assignWorkshop: vi.fn(),
}));
vi.mock("@/server/service-cost-actions", () => ({
  setPieceServiceCost: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/server/sale-price-actions", () => ({
  setPieceSalePrice: vi.fn(async () => ({ ok: true })),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const base: BoardPiece = {
  id: "p1",
  code: "RES-00001-1",
  restorationId: "r1",
  restorationCode: "RES-00001",
  clientName: "Ana Pérez",
  description: "Fuente",
  status: "aprobada",
  location: "en_tienda",
  urgent: false,
  readyForDelivery: false,
  returnedAt: null,
  workshopId: null,
  workshopName: null,
  arrivedAt: "2026-10-01T15:00:00Z",
  workshopDays: 0,
  workshopOngoing: false,
  lastObservation: null,
  serviceName: "Limpieza",
  materialName: "Plata",
  measure: "30 cm",
  weightGrams: 120,
  serviceCostCents: 4000,
  priceCents: null,
  hasOrder: false,
  photoUrl: "https://example.test/antes.jpg",
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
            urgent: true,
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
    expect(slow).toHaveTextContent("Urgente");
    expect(
      within(screen.getByTestId("pieza-RES-00001-1")).queryByLabelText(
        "Muchos días en el taller",
      ),
    ).toBeNull();
    // La pieza lleva a su detalle y la guía a la restauración (P55).
    expect(screen.getByRole("link", { name: "RES-00001-1" })).toHaveAttribute(
      "href",
      "/piezas/p1",
    );
    expect(
      screen.getAllByRole("link", { name: "Ver guía RES-00001" })[0],
    ).toHaveAttribute("href", "/restauraciones/r1");
  });

  it("muestra primero la foto de antes y los datos de la pieza", () => {
    render(
      <PiecesBoardTable
        role="ventas"
        workshops={[]}
        pieces={[
          base,
          { ...base, id: "p2", code: "RES-00001-2", photoUrl: null },
        ]}
      />,
    );
    const headers = screen
      .getAllByRole("columnheader")
      .map((h) => h.textContent);
    expect(headers.slice(1, 4)).toEqual([
      "Foto antes",
      "Pieza",
      "Guía · cliente",
    ]);
    expect(
      screen.getByRole("img", { name: "Foto de antes de RES-00001-1" }),
    ).toHaveAttribute("src", "https://example.test/antes.jpg");
    const row = screen.getByTestId("pieza-RES-00001-1");
    expect(row).toHaveTextContent("Limpieza");
    expect(row).toHaveTextContent("Plata · 30 cm · 120 g");
    expect(screen.getByTestId("pieza-RES-00001-2")).toHaveTextContent(
      "Sin foto de antes",
    );
  });

  it("logística ingresa el costo de servicio y no ve el precio de venta", () => {
    render(
      <PiecesBoardTable role="logistica" workshops={[]} pieces={[base]} />,
    );
    expect(
      screen.getByRole("columnheader", { name: "Costo servicio" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("columnheader", { name: "Precio venta" }),
    ).toBeNull();
    expect(
      screen.getByLabelText("Costo de servicio de RES-00001-1"),
    ).toHaveValue("40.00");
  });

  it("el admin ve el costo e ingresa el precio de venta", async () => {
    const { setPieceSalePrice } = await import("@/server/sale-price-actions");
    const user = userEvent.setup();
    render(<PiecesBoardTable role="admin" workshops={[]} pieces={[base]} />);
    const price = screen.getByLabelText("Precio de venta de RES-00001-1");
    expect(price).toHaveAttribute("placeholder", "Sin asignar");
    await user.type(price, "150");
    await user.click(
      screen.getByRole("button", { name: "Guardar precio de RES-00001-1" }),
    );
    expect(setPieceSalePrice).toHaveBeenCalledWith("p1", "150");
  });

  it("con la orden creada el admin cambia el precio con motivo", () => {
    render(
      <PiecesBoardTable
        role="admin"
        workshops={[]}
        pieces={[{ ...base, hasOrder: true, priceCents: 15000 }]}
      />,
    );
    const row = screen.getByTestId("pieza-RES-00001-1");
    expect(row).toHaveTextContent("S/ 150.00");
    expect(
      within(row).getByRole("button", { name: "Cambiar precio" }),
    ).toBeInTheDocument();
  });

  it("ventas ve el precio sin editarlo y no ve el costo", () => {
    render(
      <PiecesBoardTable
        role="ventas"
        workshops={[]}
        pieces={[{ ...base, serviceCostCents: null, priceCents: 15000 }]}
      />,
    );
    expect(
      screen.queryByRole("columnheader", { name: "Costo servicio" }),
    ).toBeNull();
    expect(screen.getByTestId("pieza-RES-00001-1")).toHaveTextContent(
      "S/ 150.00",
    );
    expect(
      screen.queryByLabelText("Precio de venta de RES-00001-1"),
    ).toBeNull();
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
