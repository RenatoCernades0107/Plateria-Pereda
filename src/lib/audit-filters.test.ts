import { describe, expect, it } from "vitest";

import {
  auditHref,
  limaDayEnd,
  limaDayStart,
  parseAuditFilters,
  serializeAuditFilters,
} from "./audit-filters";

const ID = "10000000-0000-4000-8000-000000000001";

describe("filtros de auditoría", () => {
  it("lee los filtros de la URL", () => {
    expect(
      parseAuditFilters({
        usuario: ID,
        entidad: "profiles",
        accion: "update",
        desde: "2026-10-01",
        hasta: "2026-10-03",
        pagina: "2",
      }),
    ).toEqual({
      actor: ID,
      entity: "profiles",
      action: "update",
      from: "2026-10-01",
      to: "2026-10-03",
      page: 2,
    });
  });

  it("sin filtros queda en la página 1", () => {
    expect(parseAuditFilters({})).toEqual({ page: 1 });
  });

  it("ignora los valores inválidos o vacíos", () => {
    expect(
      parseAuditFilters({
        usuario: "cualquiera",
        entidad: "drop table;",
        accion: "borrar",
        desde: "03/10/2026",
        hasta: "",
        pagina: "-1",
      }),
    ).toEqual({ page: 1 });
  });

  it("acepta ids de usuario sin los bits de versión de UUID", () => {
    const seed = "10000000-0000-0000-0000-000000000001";
    expect(parseAuditFilters({ usuario: seed })).toEqual({
      actor: seed,
      page: 1,
    });
  });

  it("acepta el actor sistema y toma el primer valor repetido", () => {
    expect(
      parseAuditFilters({ usuario: ["sistema", ID], pagina: ["3"] }),
    ).toEqual({ actor: "sistema", page: 3 });
  });

  it("serializa sin vacíos ni la página 1, y se puede volver a leer", () => {
    const filters = {
      actor: ID,
      action: "delete" as const,
      from: "2026-10-01",
      page: 4,
    };
    const query = serializeAuditFilters(filters);
    expect(query).toBe(`usuario=${ID}&accion=delete&desde=2026-10-01&pagina=4`);
    expect(
      parseAuditFilters(Object.fromEntries(new URLSearchParams(query))),
    ).toEqual(filters);
    expect(serializeAuditFilters({ page: 1, entity: "" })).toBe("");
  });

  it("arma el enlace a /auditoria", () => {
    expect(auditHref({ page: 1 })).toBe("/auditoria");
    expect(auditHref({ entity: "profiles", page: 2 })).toBe(
      "/auditoria?entidad=profiles&pagina=2",
    );
  });

  it("usa los días de Lima para el rango de fechas", () => {
    expect(limaDayStart("2026-10-03")).toBe("2026-10-03T05:00:00.000Z");
    expect(limaDayEnd("2026-10-03")).toBe("2026-10-04T05:00:00.000Z");
  });
});
