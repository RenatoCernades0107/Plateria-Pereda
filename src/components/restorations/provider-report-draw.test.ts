import { describe, expect, it } from "vitest";

import { providerReportModel } from "@/domain/provider-report";

import { drawProviderReport } from "./provider-report-draw";

describe("drawProviderReport", () => {
  it("la tabla lleva cantidad, medidas, peso, costo de servicio y ubicación, sin la guía aparte", async () => {
    const model = providerReportModel(
      [
        {
          id: "p1",
          code: "RES-00004-1",
          quantity: 6,
          status: "aprobada",
          location: "en_taller",
          description: "Cucharitas",
          notes: "",
          serviceName: "Pulido",
          materialName: "",
          measure: "4x12 cm",
          weightGrams: 85,
          serviceCostCents: 3000,
          workshopDeliveryDate: "2026-10-30",
        },
      ],
      { showServiceCost: true },
    );
    const raw = (await drawProviderReport(model)).output();
    for (const text of [
      "CANT.",
      "6",
      "En taller",
      "Cucharitas",
      "MEDIDAS",
      "4x12 cm",
      "85 g",
      "COSTO SERV.",
      "ENTREGA TALLER",
      "30 oct",
    ])
      expect(raw).toContain(`(${text})`);
    expect(raw).not.toContain("(N° GUÍA)");
  });

  it("sin permiso de costos no lleva la columna de costo de servicio", async () => {
    const model = providerReportModel([
      {
        id: "p1",
        code: "RES-00004-1",
        quantity: 1,
        status: "aprobada",
        location: "en_taller",
        description: "Fuente",
        notes: "",
        serviceName: "",
        materialName: "",
        measure: "",
        weightGrams: null,
        serviceCostCents: 3000,
        workshopDeliveryDate: null,
      },
    ]);
    const raw = (await drawProviderReport(model)).output();
    expect(raw).not.toContain("(COSTO SERV.)");
  });
});
