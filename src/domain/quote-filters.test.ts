import { describe, expect, it } from "vitest";

import {
  parseQuoteFilters,
  quoteFiltersHref,
  searchTerm,
} from "./quote-filters";

const CLIENT = "33333333-3333-4333-8333-333333333333";

describe("filtros de cotizaciones", () => {
  it("lee los filtros de la URL e ignora los valores inválidos", () => {
    expect(
      parseQuoteFilters({
        q: "  COT-0001 ",
        estado: "vencida",
        cliente: CLIENT.toUpperCase(),
        desde: "2026-10-01",
        hasta: "2026-02-30",
        pagina: "2",
      }),
    ).toEqual({
      q: "COT-0001",
      status: "vencida",
      clientId: CLIENT,
      from: "2026-10-01",
      to: null,
      page: 2,
    });
    expect(
      parseQuoteFilters({ estado: "otro", cliente: "x", pagina: "-1" }),
    ).toEqual({
      q: "",
      status: null,
      clientId: null,
      from: null,
      to: null,
      page: 1,
    });
  });

  it("arma la URL omitiendo los filtros vacíos", () => {
    const filters = parseQuoteFilters({});
    expect(quoteFiltersHref(filters)).toBe("/cotizaciones");
    expect(
      quoteFiltersHref(filters, {
        q: "ana",
        status: "emitida",
        clientId: CLIENT,
        from: "2026-10-01",
        to: "2026-10-31",
        page: 3,
      }),
    ).toBe(
      `/cotizaciones?q=ana&estado=emitida&cliente=${CLIENT}&desde=2026-10-01&hasta=2026-10-31&pagina=3`,
    );
  });

  it("limpia la búsqueda para el filtro de PostgREST", () => {
    expect(searchTerm(" Ana, (Pérez)* 50% ")).toBe("Ana Pérez 50");
  });
});
