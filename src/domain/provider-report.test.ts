import { describe, expect, it } from "vitest";

import {
  providerReportFileName,
  providerReportModel,
  type ProviderReportPiece,
} from "./provider-report";

const piece: ProviderReportPiece = {
  id: "p1",
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
  it("arma cada pieza con sus datos y la fecha de impresión", () => {
    const model = providerReportModel(
      [piece],
      new Date("2026-10-15T15:00:00Z"),
    );
    expect(model.printedAt).toBe("15/10/2026");
    expect(model.rows).toEqual([
      {
        id: "p1",
        code: "RES-00004-1",
        status: "Aprobada",
        description: "Marco llano",
        task: "Soldar gancho de la esquina",
        service: "Varios",
        material: "Plata 925",
        measure: "29x36",
        weight: "120 g",
      },
    ]);
  });

  it("pone un guion en los datos que faltan", () => {
    const [row] = providerReportModel([
      {
        ...piece,
        notes: "",
        serviceName: "",
        materialName: " ",
        measure: "",
        weightGrams: null,
      },
    ]).rows;
    expect(row).toMatchObject({
      task: "",
      service: "—",
      material: "—",
      measure: "—",
      weight: "—",
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
