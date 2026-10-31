import { describe, expect, it } from "vitest";

import {
  duplicateReasons,
  mergeSummary,
  reasonsLabel,
} from "./client-duplicates";

describe("duplicateReasons", () => {
  it("ordena las coincidencias de la más a la menos segura", () => {
    expect(
      duplicateReasons({
        same_name: true,
        same_phone: true,
        same_email: false,
        same_document: true,
      }),
    ).toEqual(["documento", "telefono", "nombre"]);
  });
});

describe("reasonsLabel", () => {
  it("une las coincidencias", () => {
    expect(reasonsLabel(["nombre"])).toBe("Mismo nombre");
    expect(reasonsLabel(["telefono", "nombre"])).toBe(
      "Mismo teléfono y nombre",
    );
    expect(reasonsLabel(["documento", "email", "nombre"])).toBe(
      "Mismo documento, email y nombre",
    );
  });
});

describe("mergeSummary", () => {
  it("cuenta lo que se pasó", () => {
    expect(
      mergeSummary({ restorations: 2, quotes: 1, whatsappQuotes: 0 }, "Ana"),
    ).toBe(
      "Se pasaron 2 guías y 1 cotización a Ana. El duplicado quedó desactivado.",
    );
    expect(
      mergeSummary({ restorations: 1, quotes: 0, whatsappQuotes: 0 }, "Ana"),
    ).toBe("Se pasó 1 guía a Ana. El duplicado quedó desactivado.");
  });

  it("sin nada que pasar", () => {
    expect(
      mergeSummary({ restorations: 0, quotes: 0, whatsappQuotes: 0 }, "Ana"),
    ).toMatch(/no tenía guías ni cotizaciones/);
  });
});
