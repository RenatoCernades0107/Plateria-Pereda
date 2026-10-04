import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { AuditEntry } from "@/domain/audit";

import { AuditLogList, recordKey } from "./audit-log-list";

const entry: AuditEntry = {
  id: 7,
  occurredAt: "2026-10-03T15:30:00Z",
  actorName: "Ana Admin",
  table: "profiles",
  recordId: "u1",
  action: "update",
  changes: { active: { old: true, new: false } },
};

describe("AuditLogList", () => {
  it("muestra el registro con el nombre del elemento cambiado", () => {
    render(
      <AuditLogList
        entries={[entry]}
        recordLabels={{ [recordKey("profiles", "u1")]: "Vera Ventas" }}
      />,
    );
    const fila = screen.getByTestId("auditoria-registro");
    expect(fila).toHaveTextContent("Ana Admin");
    expect(fila).toHaveTextContent("Usuario");
    expect(fila).toHaveTextContent("Vera Ventas");
    expect(fila).toHaveTextContent("Estado: Activo → Desactivado");
    expect(screen.getByTestId("auditoria-registro-movil")).toHaveTextContent(
      "Estado: Activo → Desactivado",
    );
  });

  it("sin nombre conocido muestra el id; sin actor, Sistema", () => {
    render(
      <AuditLogList
        entries={[{ ...entry, actorName: null, action: "delete" }]}
        recordLabels={{}}
      />,
    );
    const fila = screen.getByTestId("auditoria-registro");
    expect(fila).toHaveTextContent("u1");
    expect(fila).toHaveTextContent("Sistema");
    expect(fila).toHaveTextContent("Eliminación");
  });

  it("sin registros muestra un mensaje", () => {
    render(<AuditLogList entries={[]} recordLabels={{}} />);
    expect(
      screen.getByText("No hay cambios con estos filtros."),
    ).toBeInTheDocument();
  });
});
