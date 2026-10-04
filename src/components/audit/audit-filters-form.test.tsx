import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuditFiltersForm } from "./audit-filters-form";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const ID = "10000000-0000-4000-8000-000000000001";
const props = {
  actors: [{ value: ID, label: "Ana Admin" }],
  entities: [{ value: "profiles", label: "Usuario" }],
};

describe("AuditFiltersForm", () => {
  beforeEach(() => push.mockReset());

  it("muestra los filtros actuales", () => {
    render(
      <AuditFiltersForm
        {...props}
        filters={{ actor: ID, action: "update", from: "2026-10-01", page: 3 }}
      />,
    );
    expect(screen.getByLabelText("Usuario")).toHaveTextContent("Ana Admin");
    expect(screen.getByLabelText("Acción")).toHaveTextContent("Edición");
    expect(screen.getByLabelText("Entidad")).toHaveTextContent("Todos");
    expect(screen.getByLabelText("Desde")).toHaveValue("2026-10-01");
  });

  it("al filtrar lleva a la URL con los filtros y vuelve a la página 1", async () => {
    const user = userEvent.setup();
    render(
      <AuditFiltersForm {...props} filters={{ action: "update", page: 3 }} />,
    );

    await user.click(screen.getByLabelText("Entidad"));
    await user.click(await screen.findByRole("option", { name: "Usuario" }));
    await user.type(screen.getByLabelText("Hasta"), "2026-10-03");
    await user.click(screen.getByRole("button", { name: "Filtrar" }));

    expect(push).toHaveBeenCalledWith(
      "/auditoria?entidad=profiles&accion=update&hasta=2026-10-03",
    );
  });

  it("elegir Todos quita el filtro y Limpiar los quita todos", async () => {
    const user = userEvent.setup();
    render(<AuditFiltersForm {...props} filters={{ actor: ID, page: 1 }} />);

    await user.click(screen.getByLabelText("Usuario"));
    await user.click(await screen.findByRole("option", { name: "Todos" }));
    await user.click(screen.getByRole("button", { name: "Filtrar" }));
    expect(push).toHaveBeenLastCalledWith("/auditoria");

    await user.click(screen.getByRole("button", { name: "Limpiar" }));
    expect(push).toHaveBeenLastCalledWith("/auditoria");
  });
});
