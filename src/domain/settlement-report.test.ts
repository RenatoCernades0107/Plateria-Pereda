import { describe, expect, it } from "vitest";

import { formatCents } from "./money";
import {
  settlementDateFilterLabel,
  settlementReportFileName,
  settlementReportModel,
  type SettlementReportPiece,
} from "./settlement-report";

const piece: SettlementReportPiece = {
  id: "p1",
  code: "RES-00004-1",
  quantity: 2,
  status: "aprobada",
  description: "Marco llano",
  serviceName: "Pulido",
  workshopName: "Taller Ruiz",
  serviceCostCents: 4550,
};

describe("settlementReportModel", () => {
  it("suma los costos, marca los faltantes y pone el proveedor por pieza", () => {
    const model = settlementReportModel(
      [
        piece,
        {
          ...piece,
          id: "p2",
          code: "RES-00004-2",
          serviceCostCents: null,
          workshopName: null,
        },
        { ...piece, id: "p3", serviceCostCents: 1000 },
      ],
      { now: new Date("2026-10-15T15:00:00Z"), generatedBy: " Ana " },
    );
    expect(model.printedAt).toBe("15/10/2026");
    expect(model.generatedBy).toBe("Ana");
    expect(model.totalServiceCost).toBe(formatCents(5550));
    expect(model.withoutCost).toBe(1);
    expect(model.rows[0]).toMatchObject({
      provider: "Taller Ruiz",
      serviceCost: formatCents(4550),
    });
    expect(model.rows[1]).toMatchObject({
      number: 2,
      provider: "Sin proveedor",
      serviceCost: "—",
    });
  });

  it("sin filtro de fecha no lleva sección de fecha", () => {
    expect(settlementReportModel([piece]).dateFilter).toBeNull();
    expect(
      settlementReportModel([piece], {
        dateFilter: { from: null, to: null, dateField: "registro" },
      }).dateFilter,
    ).toBeNull();
  });

  it("con filtro de fecha dice el campo y el rango", () => {
    expect(
      settlementDateFilterLabel({
        from: "2026-10-01",
        to: "2026-10-31",
        dateField: "entrega",
      }),
    ).toBe("Fecha de entrega o cierre: 01/10/2026 al 31/10/2026");
    expect(
      settlementDateFilterLabel({
        from: "2026-10-01",
        to: null,
        dateField: "registro",
      }),
    ).toBe("Fecha de registro: desde 01/10/2026");
  });

  it("nombra el archivo con la fecha de Lima", () => {
    expect(settlementReportFileName(new Date("2026-10-15T15:00:00Z"))).toBe(
      "liquidacion-proveedor-2026-10-15.pdf",
    );
  });
});
