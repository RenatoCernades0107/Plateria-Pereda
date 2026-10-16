import { describe, expect, it } from "vitest";

import {
  parseRestorationPiecesView,
  pieceAnchor,
  pieceHref,
  restorationKanbanStatuses,
  restorationPiecesHref,
} from "./restoration-pieces-view";

describe("vista de las piezas en el detalle de la restauración", () => {
  it("lee la vista de la URL: kanban o, si no, lista", () => {
    expect(parseRestorationPiecesView({})).toBe("lista");
    expect(parseRestorationPiecesView({ vista: "kanban" })).toBe("kanban");
    expect(parseRestorationPiecesView({ vista: ["kanban", "lista"] })).toBe(
      "kanban",
    );
    expect(parseRestorationPiecesView({ vista: "tabla" })).toBe("lista");
  });

  it("arma los enlaces de cada vista y de la pieza", () => {
    expect(restorationPiecesHref("r1", "lista")).toBe("/restauraciones/r1");
    expect(restorationPiecesHref("r1", "kanban")).toBe(
      "/restauraciones/r1?vista=kanban",
    );
    expect(pieceAnchor("p1")).toBe("pieza-p1");
    expect(pieceHref({ id: "p1" })).toBe("/piezas/p1");
  });

  it("muestra siempre los estados en curso y los finales solo con piezas", () => {
    expect(restorationKanbanStatuses([])).toEqual([
      "registrada",
      "en_consulta",
      "en_espera",
      "aprobada",
      "observada",
    ]);
    expect(
      restorationKanbanStatuses(["aprobada", "anulada", "entregada"]),
    ).toEqual([
      "registrada",
      "en_consulta",
      "en_espera",
      "aprobada",
      "observada",
      "entregada",
      "anulada",
    ]);
  });
});
