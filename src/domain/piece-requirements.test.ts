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
  it("exige precio para aprobar, taller para enviar, costo al recibir y foto para entregar", () => {
    expect(missingFields("aprobada", piece({ hasPrice: false }))).toEqual([
      "precio",
    ]);
    expect(
      missingFields("enviada_taller", piece({ workshopId: null })),
    ).toEqual(["taller"]);
    expect(
      missingFields("recibir_taller", piece({ hasServiceCost: false })),
    ).toEqual(["costo"]);
    expect(missingFields("entregada", piece({ hasAfterPhoto: false }))).toEqual(
      ["foto_despues"],
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
      requirementsError("recibir_taller", [piece({ hasServiceCost: false })]),
    ).toContain("para recibirla del taller");
    expect(
      requirementsError("entregada", [
        piece({ code: "A-1", hasAfterPhoto: false }),
        piece({ code: "A-2" }),
        piece({ code: "A-3", hasAfterPhoto: false }),
      ]),
    ).toBe(
      "Para pasarlas a «Entregada» falta: A-1 (la foto «Después»); A-3 (la foto «Después»). Complétalo en el detalle de cada pieza.",
    );
  });
});
