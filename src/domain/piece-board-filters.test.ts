import { describe, expect, it } from "vitest";

import {
  isLongInWorkshop,
  listPiecesBoardArgs,
  parsePieceBoardFilters,
  pieceActiveOnly,
  pieceBoardHref,
  pieceBoardQuery,
  PIECES_EXPORT_LIMIT,
  pieceSortChange,
} from "./piece-board-filters";

describe("filtros de la vista de piezas", () => {
  it("lee la URL e ignora valores inválidos o de piezas cerradas", () => {
    expect(parsePieceBoardFilters({})).toEqual({
      q: "",
      guide: "",
      location: [],
      status: [],
      workshopIds: [],
      noWorkshop: false,
      minDays: null,
      urgent: false,
      ready: false,
      from: null,
      to: null,
      dateField: "registro",
      toCollect: false,
      missing: [],
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
        porcobrar: "1",
        devolver: "1",
        pagina: "2",
      }),
    ).toEqual({
      q: "RES-1",
      guide: "RES-00123",
      location: ["en_tienda"],
      status: ["rechazada"],
      workshopIds: ["00000000-0000-0000-0000-0000000000aa"],
      noWorkshop: false,
      minDays: 10,
      urgent: true,
      ready: true,
      from: null,
      to: null,
      dateField: "registro",
      toCollect: true,
      missing: [],
      sort: "guia",
      dir: "desc",
      page: 2,
      view: "tabla",
    });
    const closed = parsePieceBoardFilters({
      ubicacion: "otra",
      estado: "recibida",
      dias: "-3",
    });
    expect([closed.location, closed.status, closed.minDays]).toEqual([
      [],
      [],
      null,
    ]);
    // Las terminadas (entregadas, anuladas…) también se listan: se pueden filtrar.
    const today = parsePieceBoardFilters({
      ubicacion: "entregada",
      estado: "entregada",
    });
    expect([today.location, today.status]).toEqual([
      ["entregada"],
      ["entregada"],
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
      pieceBoardHref(filters, { location: [], minDays: null, page: 1 }),
    ).toBe("/piezas");
    expect(listPiecesBoardArgs(filters)).toEqual({
      p_query: undefined,
      p_restoration_code: undefined,
      p_location: ["en_taller"],
      p_status: undefined,
      p_workshop_ids: undefined,
      p_min_workshop_days: 7,
      p_sort: "guia",
      p_dir: "desc",
      p_from: undefined,
      p_to: undefined,
      p_date_field: "registro",
      p_active_only: undefined,
      p_limit: 50,
      p_offset: 100,
    });
  });

  it("filtra por fecha de registro o de entrega y la lleva a la URL y a la consulta", () => {
    const byRegistro = parsePieceBoardFilters({
      desde: "2026-11-01",
      hasta: "2026-11-30",
    });
    expect([byRegistro.from, byRegistro.to, byRegistro.dateField]).toEqual([
      "2026-11-01",
      "2026-11-30",
      "registro",
    ]);
    // La fecha de registro es la de por defecto: no va en la URL.
    expect(pieceBoardHref(byRegistro)).toBe(
      "/piezas?desde=2026-11-01&hasta=2026-11-30",
    );
    const byEntrega = parsePieceBoardFilters({
      desde: "2026-11-01",
      fecha: "entrega",
    });
    expect(pieceBoardHref(byEntrega)).toBe(
      "/piezas?desde=2026-11-01&fecha=entrega",
    );
    expect(listPiecesBoardArgs(byEntrega)).toMatchObject({
      p_from: "2026-11-01",
      p_to: undefined,
      p_date_field: "entrega",
    });
    const byRecibida = parsePieceBoardFilters({
      desde: "2026-11-01",
      fecha: "recibida",
    });
    expect(byRecibida.dateField).toBe("recibida");
    expect(pieceBoardHref(byRecibida)).toBe(
      "/piezas?desde=2026-11-01&fecha=recibida",
    );
    expect(listPiecesBoardArgs(byRecibida)).toMatchObject({
      p_from: "2026-11-01",
      p_date_field: "recibida",
    });
    // Sin fechas, el campo no va en la URL; fechas o campos inválidos se ignoran.
    expect(pieceBoardHref(parsePieceBoardFilters({ fecha: "entrega" }))).toBe(
      "/piezas",
    );
    const invalid = parsePieceBoardFilters({
      desde: "2026-13-40",
      hasta: "ayer",
      fecha: "otro",
    });
    expect([invalid.from, invalid.to, invalid.dateField]).toEqual([
      null,
      null,
      "registro",
    ]);
  });

  it("el kanban sin filtros de estado ni fecha trae solo las piezas en curso", () => {
    const kanban = parsePieceBoardFilters({ vista: "kanban" });
    expect(pieceActiveOnly(kanban)).toBe(true);
    expect(listPiecesBoardArgs(kanban)).toMatchObject({ p_active_only: true });
    expect(
      pieceActiveOnly(
        parsePieceBoardFilters({ vista: "kanban", estado: "entregada" }),
      ),
    ).toBe(false);
    expect(
      pieceActiveOnly(
        parsePieceBoardFilters({ vista: "kanban", desde: "2026-11-01" }),
      ),
    ).toBe(false);
    // La tabla lista todas.
    expect(pieceActiveOnly(parsePieceBoardFilters({}))).toBe(false);
  });

  it("la exportación pide todas las piezas del filtro, sin paginar", () => {
    const filters = parsePieceBoardFilters({ pagina: "3", vista: "kanban" });
    expect(listPiecesBoardArgs(filters, { all: true })).toMatchObject({
      p_limit: PIECES_EXPORT_LIMIT,
      p_offset: 0,
    });
    expect(pieceBoardQuery(parsePieceBoardFilters({ estado: "anulada" }))).toBe(
      "estado=anulada",
    );
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

  it("admite varios valores por filtro, combinados entre sí", () => {
    const A = "00000000-0000-0000-0000-0000000000aa";
    const B = "00000000-0000-0000-0000-0000000000bb";
    const filters = parsePieceBoardFilters({
      estado: ["aprobada", "observada", "aprobada", "recibida"],
      ubicacion: ["en_taller", "en_tienda"],
      taller: [A, "sin", B.toUpperCase()],
    });
    expect(filters).toMatchObject({
      status: ["aprobada", "observada"],
      location: ["en_taller", "en_tienda"],
      workshopIds: [A, B],
      noWorkshop: true,
    });
    const url = pieceBoardHref(filters);
    expect(url).toBe(
      `/piezas?ubicacion=en_taller&ubicacion=en_tienda&estado=aprobada&estado=observada&taller=${A}&taller=${B}&taller=sin`,
    );
    // Se puede volver a leer lo que se escribió.
    const query = new URLSearchParams(url.split("?")[1]);
    const again = parsePieceBoardFilters({
      estado: query.getAll("estado"),
      ubicacion: query.getAll("ubicacion"),
      taller: query.getAll("taller"),
    });
    expect(again).toEqual(filters);
    expect(listPiecesBoardArgs(filters)).toMatchObject({
      p_status: ["aprobada", "observada"],
      p_location: ["en_taller", "en_tienda"],
      p_workshop_ids: [A, B],
      p_no_workshop: true,
    });
  });

  it("filtra las piezas sin taller (taller=sin)", () => {
    const filters = parsePieceBoardFilters({ taller: "sin" });
    expect([filters.noWorkshop, filters.workshopIds]).toEqual([true, []]);
    expect(pieceBoardHref(filters)).toBe("/piezas?taller=sin");
    expect(listPiecesBoardArgs(filters)).toMatchObject({
      p_no_workshop: true,
      p_workshop_ids: undefined,
    });
    expect(
      pieceBoardHref(filters, { noWorkshop: false, workshopIds: [] }),
    ).toBe("/piezas");
  });

  it("filtra por «Falta asignar» (falta=precio&falta=costo) y lo guarda en la URL", () => {
    const filters = parsePieceBoardFilters({
      falta: ["costo", "precio", "costo", "otro"],
    });
    expect(filters.missing).toEqual(["costo", "precio"]);
    const url = pieceBoardHref(filters);
    expect(url).toBe("/piezas?falta=costo&falta=precio");
    const query = new URLSearchParams(url.split("?")[1]);
    expect(parsePieceBoardFilters({ falta: query.getAll("falta") })).toEqual(
      filters,
    );
    expect(listPiecesBoardArgs(filters)).toMatchObject({
      p_missing: ["costo", "precio"],
    });
    expect(
      listPiecesBoardArgs(parsePieceBoardFilters({})).p_missing,
    ).toBeUndefined();
    expect(pieceBoardHref(filters, { missing: [] })).toBe("/piezas");
    expect(parsePieceBoardFilters({}).missing).toEqual([]);
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
