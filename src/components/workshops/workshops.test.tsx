import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WorkshopDialog, type WorkshopRow } from "./workshop-dialog";
import { WorkshopsList } from "./workshops-list";

const mocks = vi.hoisted(() => ({
  createWorkshop: vi.fn(),
  updateWorkshop: vi.fn(),
  setWorkshopActive: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/server/workshops-actions", () => ({
  createWorkshop: (...a: unknown[]) => mocks.createWorkshop(...a),
  updateWorkshop: (...a: unknown[]) => mocks.updateWorkshop(...a),
  setWorkshopActive: (...a: unknown[]) => mocks.setWorkshopActive(...a),
}));
vi.mock("sonner", () => ({
  toast: { success: mocks.success, error: mocks.error },
}));

const taller: WorkshopRow = {
  id: "w1",
  name: "Taller Rímac",
  contactName: "Don José",
  phone: "999 111 222",
  address: "Jr. Trujillo 123",
  notes: "",
  active: true,
};

describe("WorkshopDialog", () => {
  beforeEach(() => {
    for (const fn of Object.values(mocks)) fn.mockReset();
    mocks.createWorkshop.mockResolvedValue({ ok: true });
    mocks.updateWorkshop.mockResolvedValue({ ok: true });
  });

  it("crea un taller", async () => {
    const user = userEvent.setup();
    render(<WorkshopDialog trigger={<button>Nuevo taller</button>} />);
    await user.click(screen.getByRole("button", { name: "Nuevo taller" }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText("Nombre"), "Taller Breña");
    await user.type(within(dialog).getByLabelText("Teléfono"), "988 777 666");
    await user.click(
      within(dialog).getByRole("button", { name: "Crear taller" }),
    );

    expect(mocks.createWorkshop).toHaveBeenCalledWith({
      name: "Taller Breña",
      contactName: "",
      phone: "988 777 666",
      address: "",
      notes: "",
    });
    expect(mocks.success).toHaveBeenCalledWith('Taller "Taller Breña" creado.');
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("muestra el error de nombre duplicado y no se cierra", async () => {
    mocks.createWorkshop.mockResolvedValue({
      error: "Ya existe un taller con ese nombre.",
    });
    const user = userEvent.setup();
    render(<WorkshopDialog trigger={<button>Nuevo taller</button>} />);
    await user.click(screen.getByRole("button", { name: "Nuevo taller" }));
    await user.type(screen.getByLabelText("Nombre"), "Taller Rímac");
    await user.click(screen.getByRole("button", { name: "Crear taller" }));
    expect(
      await screen.findByText("Ya existe un taller con ese nombre."),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("valida el nombre antes de enviar", async () => {
    const user = userEvent.setup();
    render(<WorkshopDialog trigger={<button>Nuevo taller</button>} />);
    await user.click(screen.getByRole("button", { name: "Nuevo taller" }));
    await user.click(screen.getByRole("button", { name: "Crear taller" }));
    expect(
      await screen.findByText("Ingresa el nombre del taller"),
    ).toBeInTheDocument();
    expect(mocks.createWorkshop).not.toHaveBeenCalled();
  });

  it("edita un taller con sus datos cargados", async () => {
    const user = userEvent.setup();
    render(
      <WorkshopDialog workshop={taller} trigger={<button>Editar</button>} />,
    );
    await user.click(screen.getByRole("button", { name: "Editar" }));
    const nombre = screen.getByLabelText("Nombre");
    expect(nombre).toHaveValue("Taller Rímac");
    await user.clear(nombre);
    await user.type(nombre, "Taller Rímac Norte");
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    expect(mocks.updateWorkshop).toHaveBeenCalledWith(
      "w1",
      expect.objectContaining({
        name: "Taller Rímac Norte",
        phone: "999 111 222",
      }),
    );
    expect(mocks.success).toHaveBeenCalledWith("Taller actualizado.");
  });
});

describe("WorkshopsList", () => {
  beforeEach(() => {
    for (const fn of Object.values(mocks)) fn.mockReset();
    mocks.setWorkshopActive.mockResolvedValue({ ok: true });
  });

  it("muestra los talleres con su contacto y estado", () => {
    render(
      <WorkshopsList
        workshops={[
          taller,
          {
            ...taller,
            id: "w2",
            name: "Taller Viejo",
            contactName: "",
            phone: "",
            active: false,
          },
        ]}
      />,
    );
    const fila = screen.getByTestId("taller-Taller Rímac");
    expect(fila).toHaveTextContent("Don José · 999 111 222");
    expect(fila).toHaveTextContent("Activo");
    expect(screen.getByTestId("taller-Taller Viejo")).toHaveTextContent(
      "Inactivo",
    );
  });

  it("desactiva y activa un taller", async () => {
    const user = userEvent.setup();
    render(<WorkshopsList workshops={[taller]} />);
    const fila = screen.getByTestId("taller-Taller Rímac");
    await user.click(within(fila).getByRole("button", { name: "Desactivar" }));
    expect(mocks.setWorkshopActive).toHaveBeenCalledWith("w1", false);
    expect(mocks.success).toHaveBeenCalledWith("Taller Rímac fue desactivado.");

    mocks.setWorkshopActive.mockResolvedValue({
      error: "No se pudo actualizar el taller.",
    });
    await user.click(within(fila).getByRole("button", { name: "Desactivar" }));
    expect(mocks.error).toHaveBeenCalledWith(
      "No se pudo actualizar el taller.",
    );
  });

  it("sin talleres muestra un mensaje", () => {
    render(<WorkshopsList workshops={[]} />);
    expect(screen.getByText(/Aún no hay talleres/)).toBeInTheDocument();
  });
});
