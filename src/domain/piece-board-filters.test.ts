import { describe, expect, it } from "vitest";

import {
  isLongInWorkshop,
  listPiecesBoardArgs,
  parsePieceBoardFilters,
  pieceBoardHref,
} from "./piece-board-filters";

describe("filtros de la vista de piezas", () => {
  it("lee la URL e ignora valores inválidos o de piezas cerradas", () => {
    expect(parsePieceBoardFilters({})).toEqual({
      q: "",
      location: null,
      status: null,
      workshopId: null,
      minDays: null,
      page: 1,
      view: "tabla",
    });
    expect(
      parsePieceBoardFilters({
        q: " RES-1 ",
        ubicacion: "en_tienda",
        estado: "recibida",
        taller: "00000000-0000-0000-0000-0000000000AA",
        dias: "10",
        pagina: "2",
      }),
    ).toEqual({
      q: "RES-1",
      location: "en_tienda",
      status: "recibida",
      workshopId: "00000000-0000-0000-0000-0000000000aa",
      minDays: 10,
      page: 2,
      view: "tabla",
    });
    const closed = parsePieceBoardFilters({
      ubicacion: "entregada",
      estado: "anulada",
      dias: "-3",
    });
    expect([closed.location, closed.status, closed.minDays]).toEqual([
      null,
      null,
      null,
    ]);
    expect(parsePieceBoardFilters({ dias: "9999" }).minDays).toBe(365);
  });

  it("arma la URL y los argumentos de la consulta", () => {
    const filters = parsePieceBoardFilters({
      ubicacion: "en_taller",
      dias: "7",
      pagina: "3",
    });
    expect(pieceBoardHref(filters)).toBe(
      "/piezas?ubicacion=en_taller&dias=7&pagina=3",
    );
    expect(
      pieceBoardHref(filters, { location: null, minDays: null, page: 1 }),
    ).toBe("/piezas");
    expect(listPiecesBoardArgs(filters)).toEqual({
      p_query: undefined,
      p_location: "en_taller",
      p_status: undefined,
      p_workshop_id: undefined,
      p_min_workshop_days: 7,
      p_limit: 50,
      p_offset: 100,
    });
  });

  it("resalta solo las piezas que siguen en el taller desde hace 7 días o más", () => {
    expect(isLongInWorkshop({ workshopDays: 7, workshopOngoing: true })).toBe(
      true,
    );
    expect(isLongInWorkshop({ workshopDays: 6, workshopOngoing: true })).toBe(
      false,
    );
    expect(isLongInWorkshop({ workshopDays: 20, workshopOngoing: false })).toBe(
      false,
    );
    expect(
      isLongInWorkshop({ workshopDays: 3, workshopOngoing: true }, 3),
    ).toBe(true);
  });

  it("en kanban trae todo en una página y lo guarda en la URL", () => {
    const filters = parsePieceBoardFilters({ vista: "kanban", pagina: "2" });
    expect(pieceBoardHref(filters)).toBe("/piezas?vista=kanban");
    expect(listPiecesBoardArgs(filters)).toMatchObject({
      p_limit: 200,
      p_offset: 0,
    });
  });
});
