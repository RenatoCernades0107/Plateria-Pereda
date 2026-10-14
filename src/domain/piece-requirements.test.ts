import { describe, expect, it } from "vitest";

import {
  missingFields,
  requirementsError,
  type RequirementFacts,
} from "./piece-requirements";

const piece = (over: Partial<RequirementFacts> = {}): RequirementFacts => ({
  code: "RES-00001-1",
  hasPrice: true,
  hasServiceCost: true,
  workshopId: "w1",
  hasAfterPhoto: true,
  ...over,
});

describe("campos obligatorios por estado (K10)", () => {
  it("exige precio para aprobar, taller para enviar, y nada al recibir ni al entregar", () => {
    expect(missingFields("aprobada", piece({ hasPrice: false }))).toEqual([
      "precio",
    ]);
    expect(
      missingFields("enviada_taller", piece({ workshopId: null })),
    ).toEqual(["taller"]);
    expect(
      missingFields("recibir_taller", piece({ hasServiceCost: false })),
    ).toEqual([]);
    expect(missingFields("entregada", piece({ hasAfterPhoto: false }))).toEqual(
      [],
    );
  });

  it("el taller elegido en el diálogo cuenta", () => {
    expect(
      missingFields("enviada_taller", piece({ workshopId: null }), "w2"),
    ).toEqual([]);
  });

  it("los demás estados no exigen nada", () => {
    const empty = piece({
      hasPrice: false,
      hasServiceCost: false,
      workshopId: null,
      hasAfterPhoto: false,
    });
    expect(missingFields("en_consulta", empty)).toEqual([]);
    expect(requirementsError("anulada", [empty])).toBeNull();
  });

  it("explica qué falta y de qué pieza", () => {
    expect(requirementsError("aprobada", [piece()])).toBeNull();
    expect(requirementsError("aprobada", [piece({ hasPrice: false })])).toBe(
      "Falta el precio de venta de RES-00001-1 para pasarla a «Aprobada». Complétalo en el detalle de la pieza.",
    );
    expect(
      requirementsError("aprobada", [
        piece({ code: "A-1", hasPrice: false }),
        piece({ code: "A-2" }),
        piece({ code: "A-3", hasPrice: false }),
      ]),
    ).toBe(
      "Para pasarlas a «Aprobada» falta: A-1 (el precio de venta); A-3 (el precio de venta). Complétalo en el detalle de cada pieza.",
    );
  });
});
