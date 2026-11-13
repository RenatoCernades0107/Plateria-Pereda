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
          urgent: false,
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
      // El título no cabe en una línea de su columna: va partido en dos.
      "ENTREGA",
      "TALLER",
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
        urgent: false,
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

  it("marca las piezas urgentes con el rayo y la etiqueta URGENTE", async () => {
    const base = {
      id: "p1",
      code: "RES-00088-1",
      quantity: 1,
      status: "en_consulta" as const,
      location: "sin_enviar" as const,
      description: "Plato ondeado",
      notes: "",
      serviceName: "Pulido",
      materialName: "",
      measure: "",
      weightGrams: null,
      serviceCostCents: null,
      workshopDeliveryDate: null,
    };
    const urgent = (
      await drawProviderReport(providerReportModel([{ ...base, urgent: true }]))
    ).output();
    const normal = (
      await drawProviderReport(
        providerReportModel([{ ...base, urgent: false }]),
      )
    ).output();
    expect(urgent).toContain("(URGENTE)");
    expect(normal).not.toContain("(URGENTE)");
  });

  it("una palabra más ancha que su columna se corta en vez de salirse", async () => {
    const model = providerReportModel([
      {
        id: "p1",
        code: "RES-00004-1",
        quantity: 1,
        urgent: false,
        status: "aprobada",
        location: "en_taller",
        description: "Fuente",
        notes: "",
        serviceName: "Electrodepositadoextraordinario",
        materialName: "",
        measure: "",
        weightGrams: null,
        serviceCostCents: null,
        workshopDeliveryDate: null,
      },
    ]);
    const raw = (await drawProviderReport(model)).output();
    expect(raw).not.toContain("(Electrodepositadoextraordinario)");
  });
});
