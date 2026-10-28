import { describe, expect, it } from "vitest";

import {
  providerReportFileName,
  providerReportModel,
  type ProviderReportPiece,
} from "./provider-report";
import { formatCents } from "./money";

const piece: ProviderReportPiece = {
  id: "p1",
  code: "RES-00004-1",
  quantity: 2,
  status: "aprobada",
  location: "en_taller",
  description: "Marco llano",
  notes: "  Soldar gancho de la esquina  ",
  serviceName: "Varios",
  materialName: "Plata 925",
  measure: "29x36",
  weightGrams: 120,
  serviceCostCents: 4550,
  workshopDeliveryDate: "2026-10-30",
};

describe("providerReportModel", () => {
  it("arma cada pieza con sus datos, la fecha de impresión y quién lo genera", () => {
    const model = providerReportModel(
      [
        piece,
        {
          ...piece,
          id: "p2",
          code: "RES-00004-2",
          serviceCostCents: null,
          workshopDeliveryDate: null,
        },
      ],
      {
        generatedBy: " María Quispe ",
        now: new Date("2026-10-15T15:00:00Z"),
        showServiceCost: true,
      },
    );
    expect(model.printedAt).toBe("15/10/2026");
    expect(model.generatedBy).toBe("María Quispe");
    expect(model.showServiceCost).toBe(true);
    expect(model.totalServiceCost).toBe(formatCents(4550));
    expect(model.rows[1]).toMatchObject({
      number: 2,
      serviceCost: "—",
      workshopDeliveryDate: "—",
    });
    // Sin el número de guía: ya va en el código de la pieza.
    expect(model.rows[0]).toEqual({
      id: "p1",
      number: 1,
      code: "RES-00004-1",
      quantity: "2",
      status: "Aprobada",
      location: "En taller",
      description: "Marco llano",
      detail: "Plata 925",
      measure: "29x36",
      weight: "120 g",
      service: "Varios",
      serviceCost: formatCents(4550),
      task: "Soldar gancho de la esquina",
      workshopDeliveryDate: "30 oct",
    });
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
    expect(model.showServiceCost).toBe(false);
    expect(model.rows[0]).toMatchObject({
      task: "",
      service: "—",
      detail: "",
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
