import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CatalogCombobox } from "./catalog-combobox";

const options = Array.from({ length: 30 }, (_, i) => ({
  id: `s${i + 1}`,
  name: `Servicio ${i + 1}`,
  price: null,
}));

describe("CatalogCombobox", () => {
  it("al buscar tras bajar por la lista, muestra el primer resultado", async () => {
    const user = userEvent.setup();
    render(
      <CatalogCombobox
        kind="services"
        options={options}
        value={[]}
        onChange={vi.fn()}
        placeholder="Elige un servicio"
      />,
    );
    await user.click(screen.getByRole("combobox"));
    const list = screen.getByRole("listbox");
    list.scrollTop = 400;
    await user.type(screen.getByPlaceholderText("Buscar…"), "Servicio 2");
    expect(list.scrollTop).toBe(0);
    expect(screen.getAllByRole("option")[0]).toHaveTextContent("Servicio 2");
  });
});
