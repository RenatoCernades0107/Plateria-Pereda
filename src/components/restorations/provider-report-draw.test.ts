import { describe, expect, it } from "vitest";

import { providerReportModel } from "@/domain/provider-report";

import { drawProviderReport } from "./provider-report-draw";

describe("drawProviderReport", () => {
  it("la tabla lleva la cantidad y la ubicación de cada pieza", async () => {
    const model = providerReportModel([
      {
        id: "p1",
        guideCode: "RES-00004",
        code: "RES-00004-1",
        quantity: 6,
        status: "aprobada",
        location: "en_taller",
        description: "Cucharitas",
        notes: "",
        serviceName: "Pulido",
        materialName: "",
        measure: "",
        weightGrams: null,
      },
    ]);
    const raw = (await drawProviderReport(model)).output();
    for (const text of ["CANT.", "6", "En taller", "Cucharitas"])
      expect(raw).toContain(`(${text})`);
  });
});
