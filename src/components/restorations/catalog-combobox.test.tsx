import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CatalogCombobox } from "./catalog-combobox";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/server/catalogs-actions", () => ({
  createCatalogOption: (...a: unknown[]) => mocks.create(...a),
}));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError } }));

const SERVICES = [
  { id: "s1", name: "Limpieza", price: 40 },
  { id: "s2", name: "Pulido", price: null },
  { id: "s3", name: "Soldadura antigua", price: null, active: false },
];

function renderCombobox(value: string[] = [], onChange = vi.fn()) {
  render(
    <CatalogCombobox
      kind="services"
      options={SERVICES}
      value={value}
      onChange={onChange}
      placeholder="Selecciona un servicio"
      aria-label="Servicio"
    />,
  );
  return onChange;
}

beforeEach(() => {
  mocks.create.mockReset();
  mocks.toastError.mockReset();
});

describe("CatalogCombobox", () => {
  it("busca y elige un servicio; se cierra al elegir", async () => {
    const user = userEvent.setup();
    const onChange = renderCombobox();
    expect(screen.getByLabelText("Servicio")).toHaveTextContent(
      "Selecciona un servicio",
    );
    await user.click(screen.getByLabelText("Servicio"));
    await user.type(screen.getByPlaceholderText("Buscar o crear…"), "pul");
    expect(screen.queryByRole("option", { name: "Limpieza" })).toBeNull();
    await user.click(screen.getByRole("option", { name: "Pulido" }));
    expect(onChange).toHaveBeenCalledWith([{ id: "s2", name: "Pulido" }]);
    expect(screen.queryByPlaceholderText("Buscar o crear…")).toBeNull();
  });

  it("muestra el ítem desactivado solo si ya está elegido", async () => {
    const user = userEvent.setup();
    renderCombobox(["s3"]);
    expect(screen.getByLabelText("Servicio")).toHaveTextContent(
      "Soldadura antigua",
    );
    await user.click(screen.getByLabelText("Servicio"));
    expect(
      screen.getByRole("option", { name: "Soldadura antigua" }),
    ).toBeInTheDocument();
  });

  it("no ofrece crear lo que ya existe y muestra el error al crear", async () => {
    const user = userEvent.setup();
    const onChange = renderCombobox();
    await user.click(screen.getByLabelText("Servicio"));
    const search = screen.getByPlaceholderText("Buscar o crear…");
    await user.type(search, "limpieza");
    expect(screen.queryByRole("option", { name: /Crear/ })).toBeNull();

    mocks.create.mockResolvedValue({ error: "No se pudo crear el ítem." });
    await user.clear(search);
    await user.type(search, "  Dorado   al fuego ");
    await user.click(
      screen.getByRole("option", { name: "Crear «Dorado al fuego»" }),
    );
    expect(mocks.create).toHaveBeenCalledWith("services", "Dorado al fuego");
    expect(mocks.toastError).toHaveBeenCalledWith("No se pudo crear el ítem.");
    expect(onChange).not.toHaveBeenCalled();
  });
});
