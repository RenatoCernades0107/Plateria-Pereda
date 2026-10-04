import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { AuditEntry } from "@/domain/audit";

import { EntityHistory } from "./entity-history";

const entries: AuditEntry[] = [
  {
    id: 2,
    occurredAt: "2026-10-03T15:30:00Z",
    actorName: "Ana Admin",
    table: "profiles",
    recordId: "u1",
    action: "update",
    changes: { role: { old: "ventas", new: "logistica" } },
  },
  {
    id: 1,
    occurredAt: "2026-10-01T13:05:00Z",
    actorName: null,
    table: "profiles",
    recordId: "u1",
    action: "insert",
    changes: { full_name: { old: null, new: "Vera Ventas" } },
  },
];

describe("EntityHistory", () => {
  it("muestra cada cambio de forma legible, con fecha, usuario y acción", () => {
    render(<EntityHistory entries={entries} />);
    const [primero, segundo] = screen
      .getByRole("list", { name: "Historial de cambios" })
      .querySelectorAll(":scope > li");

    expect(primero).toHaveTextContent("03/10/2026 10:30");
    expect(primero).toHaveTextContent("Ana Admin");
    expect(primero).toHaveTextContent("Edición");
    expect(primero).toHaveTextContent("Rol: Ventas → Logística");
    expect(segundo).toHaveTextContent("Sistema");
    expect(segundo).toHaveTextContent("Creación");
    expect(segundo).toHaveTextContent("Nombre: Vera Ventas");
  });

  it("sin cambios muestra un mensaje", () => {
    render(<EntityHistory entries={[]} />);
    expect(
      screen.getByText("Aún no hay cambios registrados."),
    ).toBeInTheDocument();
  });
});
