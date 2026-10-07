import { describe, expect, it } from "vitest";

import {
  parseWorkshopPiecesView,
  WORKSHOP_PIECES_ALL_LIMIT,
  WORKSHOP_PIECES_PAGE_SIZE,
  workshopPiecesArgs,
  workshopPiecesHref,
} from "./workshop-pieces";

describe("parseWorkshopPiecesView", () => {
  it("usa la primera página por defecto", () => {
    expect(parseWorkshopPiecesView({})).toEqual({
      page: 1,
      all: false,
      print: false,
    });
  });

  it("lee la página y descarta valores inválidos", () => {
    expect(parseWorkshopPiecesView({ pagina: "3" }).page).toBe(3);
    expect(parseWorkshopPiecesView({ pagina: "-2" }).page).toBe(1);
    expect(parseWorkshopPiecesView({ pagina: "abc" }).page).toBe(1);
  });

  it("reconoce 'ver todas'", () => {
    expect(parseWorkshopPiecesView({ todas: "1" }).all).toBe(true);
    expect(parseWorkshopPiecesView({ todas: "0" }).all).toBe(false);
    expect(parseWorkshopPiecesView({ imprimir: "1" }).print).toBe(true);
  });
});

describe("workshopPiecesHref", () => {
  it("arma el enlace de cada vista", () => {
    expect(workshopPiecesHref("w1")).toBe("/talleres/w1/piezas");
    expect(workshopPiecesHref("w1", { page: 1 })).toBe("/talleres/w1/piezas");
    expect(workshopPiecesHref("w1", { page: 2 })).toBe(
      "/talleres/w1/piezas?pagina=2",
    );
    expect(workshopPiecesHref("w1", { all: true })).toBe(
      "/talleres/w1/piezas?todas=1",
    );
    expect(workshopPiecesHref("w1", { all: true, print: true })).toBe(
      "/talleres/w1/piezas?todas=1&imprimir=1",
    );
  });
});

describe("workshopPiecesArgs", () => {
  it("pagina de a WORKSHOP_PIECES_PAGE_SIZE", () => {
    expect(workshopPiecesArgs("w1", { page: 3, all: false })).toEqual({
      p_workshop_id: "w1",
      p_limit: WORKSHOP_PIECES_PAGE_SIZE,
      p_offset: 2 * WORKSHOP_PIECES_PAGE_SIZE,
    });
  });

  it("'todas' trae desde el inicio con el tope", () => {
    expect(workshopPiecesArgs("w1", { page: 4, all: true })).toEqual({
      p_workshop_id: "w1",
      p_limit: WORKSHOP_PIECES_ALL_LIMIT,
      p_offset: 0,
    });
  });
});
