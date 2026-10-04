import { describe, expect, it } from "vitest";

import {
  activeFilter,
  clientFiltersHref,
  parseClientFilters,
} from "./client-filters";

describe("filtros del listado de clientes", () => {
  it("lee los filtros de la URL con valores por defecto", () => {
    expect(parseClientFilters({})).toEqual({
      q: "",
      kind: null,
      sync: null,
      status: "activos",
      page: 1,
    });
    expect(
      parseClientFilters({
        q: "  Ana ",
        tipo: "empresa",
        sync: "error",
        estado: "todos",
        pagina: "3",
      }),
    ).toEqual({
      q: "Ana",
      kind: "empresa",
      sync: "error",
      status: "todos",
      page: 3,
    });
  });

  it("ignora valores desconocidos", () => {
    expect(
      parseClientFilters({
        tipo: "otro",
        sync: "x",
        estado: "borrados",
        pagina: "-2",
        q: ["Rosa", "Luis"],
      }),
    ).toEqual({
      q: "Rosa",
      kind: null,
      sync: null,
      status: "activos",
      page: 1,
    });
    expect(parseClientFilters({ pagina: "abc" }).page).toBe(1);
  });

  it("arma la URL omitiendo los valores por defecto", () => {
    const base = parseClientFilters({});
    expect(clientFiltersHref(base)).toBe("/clientes");
    expect(
      clientFiltersHref(base, {
        q: "Ana",
        kind: "persona",
        sync: "pending",
        status: "inactivos",
        page: 2,
      }),
    ).toBe(
      "/clientes?q=Ana&tipo=persona&sync=pending&estado=inactivos&pagina=2",
    );
  });

  it("traduce el estado a la condición de activo", () => {
    expect(activeFilter("activos")).toBe(true);
    expect(activeFilter("inactivos")).toBe(false);
    expect(activeFilter("todos")).toBeNull();
  });
});
