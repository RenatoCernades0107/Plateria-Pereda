import { describe, expect, it } from "vitest";

import {
  isLongInWorkshop,
  listPiecesBoardArgs,
  parsePieceBoardFilters,
  pieceBoardHref,
  pieceSortChange,
} from "./piece-board-filters";

describe("filtros de la vista de piezas", () => {
  it("lee la URL e ignora valores inválidos o de piezas cerradas", () => {
    expect(parsePieceBoardFilters({})).toEqual({
      q: "",
      guide: "",
      location: null,
      status: null,
      workshopId: null,
      noWorkshop: false,
      minDays: null,
      urgent: false,
      ready: false,
      sort: "guia",
      dir: "desc",
      page: 1,
      view: "tabla",
    });
    expect(
      parsePieceBoardFilters({
        q: " RES-1 ",
        guia: " RES-00123 ",
        ubicacion: "en_tienda",
        estado: "rechazada",
        taller: "00000000-0000-0000-0000-0000000000AA",
        dias: "10",
        urgentes: "1",
        listas: "1",
        devolver: "1",
        pagina: "2",
      }),
    ).toEqual({
      q: "RES-1",
      guide: "RES-00123",
      location: "en_tienda",
      status: "rechazada",
      workshopId: "00000000-0000-0000-0000-0000000000aa",
      noWorkshop: false,
      minDays: 10,
      urgent: true,
      ready: true,
      sort: "guia",
      dir: "desc",
      page: 2,
      view: "tabla",
    });
    const closed = parsePieceBoardFilters({
      ubicacion: "anulada",
      estado: "recibida",
      dias: "-3",
    });
    expect([closed.location, closed.status, closed.minDays]).toEqual([
      null,
      null,
      null,
    ]);
    // Las entregadas hoy siguen en la vista: se pueden filtrar.
    const today = parsePieceBoardFilters({
      ubicacion: "entregada",
      estado: "entregada",
    });
    expect([today.location, today.status]).toEqual(["entregada", "entregada"]);
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
      p_restoration_code: undefined,
      p_location: "en_taller",
      p_status: undefined,
      p_workshop_id: undefined,
      p_min_workshop_days: 7,
      p_sort: "guia",
      p_dir: "desc",
      p_limit: 50,
      p_offset: 100,
    });
  });

  it("ordena por guía por defecto; el orden elegido va en la URL", () => {
    const byPrice = parsePieceBoardFilters({ orden: "precio", dir: "asc" });
    expect([byPrice.sort, byPrice.dir]).toEqual(["precio", "asc"]);
    expect(pieceBoardHref(byPrice)).toBe("/piezas?orden=precio&dir=asc");
    expect(listPiecesBoardArgs(byPrice)).toMatchObject({
      p_sort: "precio",
      p_dir: "asc",
    });
    // Un orden desconocido vuelve al de guía; el de por defecto no va en la URL.
    const unknown = parsePieceBoardFilters({ orden: "urgente", dir: "x" });
    expect([unknown.sort, unknown.dir]).toEqual(["guia", "desc"]);
    expect(pieceBoardHref(unknown)).toBe("/piezas");
  });

  it("al ordenar por otra columna empieza de mayor a menor; la misma invierte", () => {
    const filters = parsePieceBoardFilters({ pagina: "3" });
    expect(pieceSortChange(filters, "guia")).toEqual({
      sort: "guia",
      dir: "asc",
      page: 1,
    });
    expect(pieceSortChange(filters, "precio")).toEqual({
      sort: "precio",
      dir: "desc",
      page: 1,
    });
    const asc = parsePieceBoardFilters({ orden: "fecha", dir: "asc" });
    expect(pieceSortChange(asc, "fecha")).toMatchObject({ dir: "desc" });
  });

  it("filtra las piezas sin taller (taller=sin)", () => {
    const filters = parsePieceBoardFilters({ taller: "sin" });
    expect([filters.noWorkshop, filters.workshopId]).toEqual([true, null]);
    expect(pieceBoardHref(filters)).toBe("/piezas?taller=sin");
    expect(listPiecesBoardArgs(filters)).toMatchObject({
      p_no_workshop: true,
      p_workshop_id: undefined,
    });
    expect(
      pieceBoardHref(filters, { noWorkshop: false, workshopId: null }),
    ).toBe("/piezas");
  });

  it("ya no lee el chip «Por devolver» (va dentro de «Listas»)", () => {
    expect(parsePieceBoardFilters({ devolver: "1" })).not.toHaveProperty(
      "toReturn",
    );
  });

  it("filtra por número de guía", () => {
    const filters = parsePieceBoardFilters({ guia: "123" });
    expect(pieceBoardHref(filters)).toBe("/piezas?guia=123");
    expect(listPiecesBoardArgs(filters)).toMatchObject({
      p_restoration_code: "123",
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
