import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CatalogManager } from "./catalog-manager";

const mocks = vi.hoisted(() => ({
  createCatalogItem: vi.fn(),
  updateCatalogItem: vi.fn(),
  setCatalogItemActive: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/server/catalogs-actions", () => ({
  createCatalogItem: (...a: unknown[]) => mocks.createCatalogItem(...a),
  updateCatalogItem: (...a: unknown[]) => mocks.updateCatalogItem(...a),
  setCatalogItemActive: (...a: unknown[]) => mocks.setCatalogItemActive(...a),
}));
vi.mock("sonner", () => ({
  toast: { success: mocks.success, error: mocks.error },
}));

const services = [
  { id: "s1", name: "Limpieza", price: 35, active: true },
  { id: "s2", name: "Dorado", price: null, active: false },
];

describe("CatalogManager", () => {
  beforeEach(() => {
    for (const fn of Object.values(mocks)) fn.mockReset();
    for (const fn of [
      mocks.createCatalogItem,
      mocks.updateCatalogItem,
      mocks.setCatalogItemActive,
    ])
      fn.mockResolvedValue({ ok: true });
  });

  it("muestra los servicios con su precio y estado", () => {
    render(<CatalogManager kind="services" items={services} />);
    expect(screen.getByTestId("catalogo-Limpieza")).toHaveTextContent(
      "S/ 35.00",
    );
    const dorado = screen.getByTestId("catalogo-Dorado");
    expect(dorado).toHaveTextContent("Sin precio sugerido");
    expect(dorado).toHaveTextContent("Inactivo");
    expect(
      within(dorado).getByRole("button", { name: "Activar" }),
    ).toBeVisible();
  });

  it("agrega un servicio con precio sugerido", async () => {
    const user = userEvent.setup();
    render(<CatalogManager kind="services" items={[]} />);
    expect(screen.getByText("Aún no hay servicios.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Agregar" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Nuevo servicio")).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText("Nombre"), "Soldadura");
    await user.type(
      within(dialog).getByLabelText("Precio sugerido (S/)"),
      "45,50",
    );
    await user.click(within(dialog).getByRole("button", { name: "Agregar" }));
    expect(mocks.createCatalogItem).toHaveBeenCalledWith("services", {
      name: "Soldadura",
      price: "45,50",
    });
    expect(mocks.success).toHaveBeenCalledWith('"Soldadura" agregado.');
  });

  it("los materiales no piden precio y valida el nombre", async () => {
    const user = userEvent.setup();
    render(<CatalogManager kind="materials" items={[]} />);
    await user.click(screen.getByRole("button", { name: "Agregar" }));
    expect(
      screen.queryByLabelText("Precio sugerido (S/)"),
    ).not.toBeInTheDocument();
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Agregar",
      }),
    );
    expect(await screen.findByText("Ingresa el nombre")).toBeInTheDocument();
    expect(mocks.createCatalogItem).not.toHaveBeenCalled();
  });

  it("edita un ítem y muestra el error de duplicado", async () => {
    mocks.updateCatalogItem.mockResolvedValue({
      error: "Ya existe un ítem con ese nombre.",
    });
    const user = userEvent.setup();
    render(<CatalogManager kind="services" items={services} />);
    await user.click(screen.getByRole("button", { name: "Editar Limpieza" }));
    expect(screen.getByLabelText("Precio sugerido (S/)")).toHaveValue("35.00");
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    expect(mocks.updateCatalogItem).toHaveBeenCalledWith("services", "s1", {
      name: "Limpieza",
      price: "35.00",
    });
    expect(
      await screen.findByText("Ya existe un ítem con ese nombre."),
    ).toBeInTheDocument();
  });

  it("desactiva un ítem", async () => {
    const user = userEvent.setup();
    render(<CatalogManager kind="services" items={services} />);
    await user.click(
      within(screen.getByTestId("catalogo-Limpieza")).getByRole("button", {
        name: "Desactivar",
      }),
    );
    expect(mocks.setCatalogItemActive).toHaveBeenCalledWith(
      "services",
      "s1",
      false,
    );
    expect(mocks.success).toHaveBeenCalledWith('"Limpieza" fue desactivado.');
  });
});
