import { describe, expect, it } from "vitest";

import {
  listPiecesHistoryArgs,
  parsePieceHistoryFilters,
  pieceHistoryHref,
} from "./piece-history-filters";

describe("filtros del historial de piezas", () => {
  it("lee la URL e ignora valores inválidos", () => {
    expect(parsePieceHistoryFilters({})).toEqual({
      q: "",
      guide: "",
      status: null,
      workshopId: null,
      from: null,
      to: null,
      page: 1,
    });
    expect(
      parsePieceHistoryFilters({
        q: " Fuente ",
        guia: " 123 ",
        estado: "entregada",
        taller: "00000000-0000-0000-0000-0000000000AA",
        desde: "2026-10-01",
        hasta: "2026-10-14",
        pagina: "2",
      }),
    ).toEqual({
      q: "Fuente",
      guide: "123",
      status: "entregada",
      workshopId: "00000000-0000-0000-0000-0000000000aa",
      from: "2026-10-01",
      to: "2026-10-14",
      page: 2,
    });
    // Solo estados terminados y fechas válidas.
    const invalid = parsePieceHistoryFilters({
      estado: "aprobada",
      desde: "2026-02-30",
      hasta: "ayer",
      taller: "x",
    });
    expect([
      invalid.status,
      invalid.from,
      invalid.to,
      invalid.workshopId,
    ]).toEqual([null, null, null, null]);
  });

  it("arma la URL y los argumentos de la consulta", () => {
    const filters = parsePieceHistoryFilters({
      guia: "RES-00123",
      estado: "anulada",
      desde: "2026-10-01",
      pagina: "3",
    });
    expect(pieceHistoryHref(filters)).toBe(
      "/piezas/historial?guia=RES-00123&estado=anulada&desde=2026-10-01&pagina=3",
    );
    expect(pieceHistoryHref(filters, { page: 1, status: null })).toBe(
      "/piezas/historial?guia=RES-00123&desde=2026-10-01",
    );
    expect(pieceHistoryHref(parsePieceHistoryFilters({}))).toBe(
      "/piezas/historial",
    );
    expect(listPiecesHistoryArgs(filters)).toEqual({
      p_query: undefined,
      p_restoration_code: "RES-00123",
      p_status: "anulada",
      p_workshop_id: undefined,
      p_from: "2026-10-01",
      p_to: undefined,
      p_limit: 50,
      p_offset: 100,
    });
  });
});
