import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { WorkshopPiece } from "@/server/workshop-pieces";

import { WorkshopPiecesTable } from "./workshop-pieces-table";

const mocks = vi.hoisted(() => ({
  setPieceServiceCost: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/server/service-cost-actions", () => ({
  setPieceServiceCost: (...a: unknown[]) => mocks.setPieceServiceCost(...a),
}));
vi.mock("sonner", () => ({
  toast: { success: mocks.success, error: mocks.error },
}));

const base: WorkshopPiece = {
  id: "p1",
  restorationId: "r1",
  restorationCode: "RES-00001",
  status: "enviada_taller",
  code: "RES-00001-1",
  description: "Fuente con abolladuras",
  serviceName: "Pulido",
  measure: "40 cm",
  materialName: "Plata 950",
  weightGrams: 820.5,
  serviceCostCents: 15000,
};

const sinCosto: WorkshopPiece = {
  ...base,
  id: "p2",
  code: "RES-00001-2",
  serviceName: "",
  measure: "",
  materialName: "",
  weightGrams: null,
  serviceCostCents: null,
};

describe("WorkshopPiecesTable", () => {
  beforeEach(() => {
    for (const fn of Object.values(mocks)) fn.mockReset();
    mocks.setPieceServiceCost.mockResolvedValue({ ok: true });
  });

  it("muestra las columnas que necesita el proveedor", () => {
    render(
      <WorkshopPiecesTable
        pieces={[base, sinCosto]}
        totalCostCents={15000}
        canEditCost={false}
      />,
    );
    for (const name of [
      "ID restauración",
      "Estado",
      "ID pieza",
      "Descripción",
      "Servicio",
      "Medida",
      "Material",
      "Peso",
      "Costo de servicio",
    ]) {
      expect(screen.getByRole("columnheader", { name })).toBeInTheDocument();
    }
    const row = within(screen.getByTestId("pieza-RES-00001-1"));
    expect(row.getByText("RES-00001")).toBeInTheDocument();
    expect(row.getByText("Fuente con abolladuras")).toBeInTheDocument();
    expect(row.getByText("Pulido")).toBeInTheDocument();
    expect(row.getByText("40 cm")).toBeInTheDocument();
    expect(row.getByText("Plata 950")).toBeInTheDocument();
    expect(row.getByText("820.5 g")).toBeInTheDocument();
    expect(row.getByText(/150\.00/)).toBeInTheDocument();
    expect(
      within(screen.getByTestId("pieza-RES-00001-2")).getByText("Por definir"),
    ).toBeInTheDocument();
  });

  it("sin permiso no hay campo para editar el costo", () => {
    render(
      <WorkshopPiecesTable
        pieces={[base]}
        totalCostCents={15000}
        canEditCost={false}
      />,
    );
    expect(screen.queryByLabelText(/Costo de servicio de/)).toBeNull();
  });

  it("con permiso guarda el costo escrito", async () => {
    const user = userEvent.setup();
    render(
      <WorkshopPiecesTable
        pieces={[sinCosto]}
        totalCostCents={0}
        canEditCost
      />,
    );
    await user.type(
      screen.getByLabelText("Costo de servicio de RES-00001-2"),
      "85.50",
    );
    await user.click(
      screen.getByRole("button", { name: "Guardar costo de RES-00001-2" }),
    );
    expect(mocks.setPieceServiceCost).toHaveBeenCalledWith("p2", "85.50");
    expect(mocks.success).toHaveBeenCalled();
  });

  it("muestra el error si no se pudo guardar", async () => {
    mocks.setPieceServiceCost.mockResolvedValue({ error: "Monto inválido" });
    const user = userEvent.setup();
    render(
      <WorkshopPiecesTable
        pieces={[sinCosto]}
        totalCostCents={0}
        canEditCost
      />,
    );
    await user.type(
      screen.getByLabelText("Costo de servicio de RES-00001-2"),
      "x",
    );
    await user.click(
      screen.getByRole("button", { name: "Guardar costo de RES-00001-2" }),
    );
    expect(mocks.error).toHaveBeenCalledWith("Monto inválido");
  });

  it("avisa cuando el taller no tiene piezas", () => {
    render(<WorkshopPiecesTable pieces={[]} totalCostCents={0} canEditCost />);
    expect(screen.getByText(/no tiene piezas pendientes/)).toBeInTheDocument();
  });
});
