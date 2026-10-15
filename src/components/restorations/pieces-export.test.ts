import { describe, expect, it } from "vitest";

import type { BoardPiece } from "@/server/restorations/queries";

import { exportFileName, exportRow } from "./pieces-export";

const piece = {
  id: "p1",
  code: "RES-00001-1",
  restorationCode: "RES-00001",
  clientName: "Ana Pérez",
  description: "Fuente",
  serviceName: "Limpieza",
  status: "aprobada",
  workshopName: null,
  priceCents: 15000,
} as BoardPiece;

describe("exportación de piezas", () => {
  it("arma el nombre del archivo con la fecha", () => {
    expect(exportFileName("pdf", new Date("2026-10-14T12:00:00Z"))).toBe(
      "piezas-2026-10-14.pdf",
    );
  });

  it("omite el cliente si el rol no lo ve (logística)", () => {
    expect(exportRow(piece, false, false).client).toBe("RES-00001");
  });

  it("incluye el precio solo si el rol lo ve", () => {
    const row = exportRow(piece, true);
    expect(row).toMatchObject({
      code: "RES-00001-1",
      client: "RES-00001 · Ana Pérez",
      workshop: "Sin taller",
      price: "S/ 150.00",
    });
    expect(exportRow(piece, false).price).toBeNull();
    expect(exportRow({ ...piece, priceCents: null }, true).price).toBe(
      "Por definir",
    );
  });
});
