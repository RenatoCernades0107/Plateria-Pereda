import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CatalogCombobox } from "./catalog-combobox";

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

describe("CatalogCombobox", () => {
  it("busca y elige un servicio; se cierra al elegir", async () => {
    const user = userEvent.setup();
    const onChange = renderCombobox();
    expect(screen.getByLabelText("Servicio")).toHaveTextContent(
      "Selecciona un servicio",
    );
    await user.click(screen.getByLabelText("Servicio"));
    await user.type(screen.getByPlaceholderText("Buscar…"), "pul");
    expect(screen.queryByRole("option", { name: "Limpieza" })).toBeNull();
    await user.click(screen.getByRole("option", { name: "Pulido" }));
    expect(onChange).toHaveBeenCalledWith([{ id: "s2", name: "Pulido" }]);
    expect(screen.queryByPlaceholderText("Buscar…")).toBeNull();
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

  it("solo elige: lo que no existe no se puede crear y se indica al administrador", async () => {
    const user = userEvent.setup();
    const onChange = renderCombobox();
    await user.click(screen.getByLabelText("Servicio"));
    await user.type(screen.getByPlaceholderText("Buscar…"), "Dorado al fuego");
    expect(screen.queryByRole("option")).toBeNull();
    expect(screen.queryByText(/Crear/)).toBeNull();
    expect(
      screen.getByText(
        "No existe ese servicio. El administrador puede agregarlo en Configuración.",
      ),
    ).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("los materiales se eligen de a varios y se quitan todos juntos", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <CatalogCombobox
        kind="materials"
        options={[
          { id: "m1", name: "Plata", price: null },
          { id: "m2", name: "Alpaca", price: null },
        ]}
        value={["m1"]}
        onChange={onChange}
        multiple
        placeholder="Selecciona materiales"
        aria-label="Material"
      />,
    );
    await user.click(screen.getByLabelText("Material"));
    await user.click(screen.getByRole("option", { name: "Alpaca" }));
    expect(onChange).toHaveBeenCalledWith([
      { id: "m1", name: "Plata" },
      { id: "m2", name: "Alpaca" },
    ]);
    await user.click(screen.getByRole("button", { name: "Quitar todos" }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });
});
