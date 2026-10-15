import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuditFiltersForm } from "./audit-filters-form";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

const ID = "10000000-0000-4000-8000-000000000001";
const props = {
  actors: [{ value: ID, label: "Ana Admin" }],
  entities: [{ value: "profiles", label: "Usuario" }],
};

describe("AuditFiltersForm", () => {
  beforeEach(() => replace.mockReset());

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

  it("aplica los filtros solos, en la URL y desde la página 1", async () => {
    const user = userEvent.setup();
    render(
      <AuditFiltersForm {...props} filters={{ action: "update", page: 3 }} />,
    );

    await user.click(screen.getByLabelText("Entidad"));
    await user.click(await screen.findByRole("option", { name: "Usuario" }));
    expect(replace).toHaveBeenLastCalledWith(
      "/auditoria?entidad=profiles&accion=update",
      { scroll: false },
    );
    await user.type(screen.getByLabelText("Hasta"), "2026-10-03");

    expect(replace).toHaveBeenLastCalledWith(
      "/auditoria?entidad=profiles&accion=update&hasta=2026-10-03",
      { scroll: false },
    );
    expect(screen.queryByRole("button", { name: "Filtrar" })).toBeNull();
  });

  it("elegir Todos quita el filtro y Limpiar los quita todos", async () => {
    const user = userEvent.setup();
    render(<AuditFiltersForm {...props} filters={{ actor: ID, page: 1 }} />);

    await user.click(screen.getByLabelText("Usuario"));
    await user.click(await screen.findByRole("option", { name: "Todos" }));
    expect(replace).toHaveBeenLastCalledWith("/auditoria", { scroll: false });

    await user.click(screen.getByLabelText("Entidad"));
    await user.click(await screen.findByRole("option", { name: "Usuario" }));
    await user.click(screen.getByRole("button", { name: "Limpiar" }));
    expect(replace).toHaveBeenLastCalledWith("/auditoria", { scroll: false });
    expect(screen.getByLabelText("Entidad")).toHaveTextContent("Todos");
  });
});
