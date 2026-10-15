import { describe, expect, it } from "vitest";

import {
  providerReportFileName,
  providerReportModel,
  type ProviderReportPiece,
} from "./provider-report";

const piece: ProviderReportPiece = {
  id: "p1",
  guideCode: "RES-00004",
  code: "RES-00004-1",
  status: "aprobada",
  description: "Marco llano",
  notes: "  Soldar gancho de la esquina  ",
  serviceName: "Varios",
  materialName: "Plata 925",
  measure: "29x36",
  weightGrams: 120,
};

describe("providerReportModel", () => {
  it("arma cada pieza con sus datos, la fecha de impresión y quién lo genera", () => {
    const model = providerReportModel([piece], {
      generatedBy: " María Quispe ",
      now: new Date("2026-10-15T15:00:00Z"),
    });
    expect(model.printedAt).toBe("15/10/2026");
    expect(model.generatedBy).toBe("María Quispe");
    expect(model.rows).toEqual([
      {
        id: "p1",
        number: 1,
        guide: "RES-00004",
        code: "RES-00004-1",
        status: "Aprobada",
        description: "Marco llano",
        detail: "Plata 925 · 29x36 · 120 g",
        service: "Varios",
        task: "Soldar gancho de la esquina",
      },
    ]);
  });

  it("omite los datos que faltan", () => {
    const model = providerReportModel([
      {
        ...piece,
        notes: "",
        serviceName: "",
        materialName: " ",
        measure: "",
        weightGrams: null,
      },
    ]);
    expect(model.generatedBy).toBeNull();
    expect(model.rows[0]).toMatchObject({
      task: "",
      service: "—",
      detail: "",
    });
  });
});

describe("providerReportFileName", () => {
  it("usa la fecha de impresión", () => {
    expect(providerReportFileName(new Date("2026-10-15T15:00:00Z"))).toBe(
      "reporte-proveedor-2026-10-15.pdf",
    );
  });
});
