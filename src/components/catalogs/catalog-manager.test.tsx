import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CatalogManager } from "./catalog-manager";

const mocks = vi.hoisted(() => ({
  createCatalogItem: vi.fn(),
  updateCatalogItem: vi.fn(),
  setCatalogItemActive: vi.fn(),
  setCatalogItemDefault: vi.fn(),
  deleteCatalogItem: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/server/catalogs-actions", () => ({
  createCatalogItem: (...a: unknown[]) => mocks.createCatalogItem(...a),
  updateCatalogItem: (...a: unknown[]) => mocks.updateCatalogItem(...a),
  setCatalogItemActive: (...a: unknown[]) => mocks.setCatalogItemActive(...a),
  setCatalogItemDefault: (...a: unknown[]) => mocks.setCatalogItemDefault(...a),
  deleteCatalogItem: (...a: unknown[]) => mocks.deleteCatalogItem(...a),
}));
vi.mock("sonner", () => ({
  toast: { success: mocks.success, error: mocks.error },
}));

const materials = [{ id: "m1", name: "Alpaca", price: null, active: true }];

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
      mocks.setCatalogItemDefault,
      mocks.deleteCatalogItem,
    ])
      fn.mockResolvedValue({ ok: true });
  });

  it("muestra los servicios con su precio y estado", () => {
    render(<CatalogManager kind="services" items={services} />);
    expect(
      within(screen.getByRole("table", { name: "Servicios" }))
        .getAllByRole("columnheader")
        .map((h) => h.textContent),
    ).toEqual(["Nombre", "Precio sugerido", "Estado", "Acciones"]);
    expect(screen.getByTestId("catalogo-Limpieza").tagName).toBe("TR");
    expect(screen.getByTestId("catalogo-Limpieza")).toHaveTextContent(
      "S/ 35.00",
    );
    expect(screen.getByTestId("catalogo-movil-Limpieza")).toHaveTextContent(
      "S/ 35.00",
    );
    const dorado = screen.getByTestId("catalogo-Dorado");
    expect(dorado).toHaveTextContent("Sin precio sugerido");
    expect(dorado).toHaveTextContent("Inactivo");
    expect(
      within(dorado).getByRole("button", { name: "Activar" }),
    ).toBeVisible();
  });

  it("marca un material por defecto; los inactivos y los métodos de pago no", async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <CatalogManager
        kind="materials"
        items={[
          ...materials,
          {
            id: "m2",
            name: "Plata",
            price: null,
            active: true,
            isDefault: true,
          },
          { id: "m3", name: "Cobre", price: null, active: false },
        ]}
      />,
    );
    const plata = screen.getByTestId("catalogo-Plata");
    expect(within(plata).getAllByRole("cell")[0]).toHaveTextContent(
      "PlataPor defecto",
    );
    expect(
      within(screen.getByTestId("catalogo-Alpaca")).getAllByRole("cell")[0],
    ).toHaveTextContent(/^Alpaca$/);
    expect(
      screen.queryByRole("button", { name: "Marcar Cobre por defecto" }),
    ).not.toBeInTheDocument();
    await user.click(
      within(screen.getByTestId("catalogo-Alpaca")).getByRole("button", {
        name: "Marcar Alpaca por defecto",
      }),
    );
    expect(mocks.setCatalogItemDefault).toHaveBeenCalledWith(
      "materials",
      "m1",
      true,
    );
    await user.click(
      within(plata).getByRole("button", { name: "Quitar Plata por defecto" }),
    );
    expect(mocks.setCatalogItemDefault).toHaveBeenLastCalledWith(
      "materials",
      "m2",
      false,
    );
    unmount();

    render(
      <CatalogManager
        kind="payment_methods"
        items={[{ id: "p1", name: "Yape", price: null, active: true }]}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /por defecto/ }),
    ).not.toBeInTheDocument();
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
    // En jsdom se ven la tabla y la lista del celular: se usa la fila.
    await user.click(
      within(screen.getByTestId("catalogo-Limpieza")).getByRole("button", {
        name: "Editar Limpieza",
      }),
    );
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

  it("elimina un ítem después de confirmar", async () => {
    const user = userEvent.setup();
    render(<CatalogManager kind="materials" items={materials} />);
    await user.click(
      within(screen.getByTestId("catalogo-Alpaca")).getByRole("button", {
        name: "Eliminar Alpaca",
      }),
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Eliminar material");
    expect(dialog).toHaveTextContent('¿Eliminar "Alpaca"?');
    // Hasta confirmar no se borra nada.
    expect(mocks.deleteCatalogItem).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Eliminar" }));
    expect(mocks.deleteCatalogItem).toHaveBeenCalledWith("materials", "m1");
    expect(mocks.success).toHaveBeenCalledWith('"Alpaca" fue eliminado.');
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("si el ítem está en uso muestra el aviso y deja abierto el diálogo", async () => {
    mocks.deleteCatalogItem.mockResolvedValue({
      error: "“Alpaca” está en uso en 2 piezas. Desactívalo en su lugar.",
    });
    const user = userEvent.setup();
    render(<CatalogManager kind="materials" items={materials} />);
    await user.click(
      within(screen.getByTestId("catalogo-Alpaca")).getByRole("button", {
        name: "Eliminar Alpaca",
      }),
    );
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Eliminar" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "“Alpaca” está en uso en 2 piezas. Desactívalo en su lugar.",
    );
    expect(mocks.success).not.toHaveBeenCalled();
    // Cancelar cierra sin borrar nada más.
    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mocks.deleteCatalogItem).toHaveBeenCalledTimes(1);
  });

  it("los métodos de pago también se eliminan, con el aviso de los pagos", async () => {
    mocks.deleteCatalogItem.mockResolvedValue({
      error: "“Yape” está en uso en 3 pagos. Desactívalo en su lugar.",
    });
    const user = userEvent.setup();
    render(
      <CatalogManager
        kind="payment_methods"
        items={[{ id: "p1", name: "Yape", price: null, active: true }]}
      />,
    );
    await user.click(
      within(screen.getByTestId("catalogo-Yape")).getByRole("button", {
        name: "Eliminar Yape",
      }),
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Eliminar método de pago");
    expect(dialog).toHaveTextContent(
      "Si algún pago ya lo usa, no se podrá eliminar: desactívalo.",
    );
    await user.click(within(dialog).getByRole("button", { name: "Eliminar" }));
    expect(mocks.deleteCatalogItem).toHaveBeenCalledWith(
      "payment_methods",
      "p1",
    );
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "“Yape” está en uso en 3 pagos. Desactívalo en su lugar.",
    );
  });
});
