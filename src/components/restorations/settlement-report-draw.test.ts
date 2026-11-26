import { describe, expect, it } from "vitest";

import { settlementReportModel } from "@/domain/settlement-report";

import { drawSettlementReport } from "./settlement-report-draw";

const piece = {
  id: "p1",
  code: "RES-00004-1",
  quantity: 6,
  status: "aprobada" as const,
  description: "Cucharitas",
  serviceName: "Pulido",
  workshopName: "Taller Ruiz",
  serviceCostCents: 3000,
};

describe("drawSettlementReport", () => {
  it("lleva proveedor, costo, total y el filtro de fecha", async () => {
    const model = settlementReportModel([piece], {
      dateFilter: {
        from: "2026-10-01",
        to: "2026-10-31",
        dateField: "registro",
      },
    });
    const raw = (await drawSettlementReport(model)).output();
    for (const text of [
      "PROVEEDOR",
      "COSTO SERV.",
      "Taller Ruiz",
      "Cucharitas",
      `FILTRO DE FECHA  ${model.dateFilter}`,
      `TOTAL COSTO DE SERVICIO: ${model.totalServiceCost}`,
    ])
      expect(raw).toContain(`(${text})`);
  });

  it("sin filtro de fecha no dibuja esa sección", async () => {
    const raw = (
      await drawSettlementReport(settlementReportModel([piece]))
    ).output();
    expect(raw).not.toContain("FILTRO DE FECHA");
  });
});
