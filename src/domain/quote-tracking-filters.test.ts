import { describe, expect, it } from "vitest";

import {
  NO_WORKSHOP,
  parseTrackingFilters,
  trackingFiltersHref,
} from "./quote-tracking-filters";

const WORKSHOP = "33333333-3333-4333-8333-333333333333";

describe("filtros del seguimiento de cotizaciones", () => {
  it("lee los filtros de la URL e ignora los valores inválidos", () => {
    expect(
      parseTrackingFilters({
        q: "  COT-1 ",
        estado: "facturada",
        taller: WORKSHOP.toUpperCase(),
        ubicacion: "en_taller",
        pagina: "3",
      }),
    ).toEqual({
      q: "COT-1",
      status: "facturada",
      workshop: WORKSHOP,
      location: "en_taller",
      page: 3,
    });
    expect(
      parseTrackingFilters({
        estado: "emitida",
        taller: "x",
        ubicacion: "otra",
        pagina: "0",
      }),
    ).toEqual({
      q: "",
      status: null,
      workshop: null,
      location: null,
      page: 1,
    });
  });

  it("acepta «sin taller»", () => {
    expect(parseTrackingFilters({ taller: NO_WORKSHOP }).workshop).toBe(
      NO_WORKSHOP,
    );
  });

  it("arma la URL omitiendo los filtros vacíos", () => {
    const filters = parseTrackingFilters({});
    expect(trackingFiltersHref(filters)).toBe("/cotizaciones");
    expect(
      trackingFiltersHref(filters, {
        status: "aceptada",
        workshop: NO_WORKSHOP,
        location: "entregado",
        page: 2,
      }),
    ).toBe(
      "/cotizaciones?estado=aceptada&taller=sin&ubicacion=entregado&pagina=2",
    );
  });
});
