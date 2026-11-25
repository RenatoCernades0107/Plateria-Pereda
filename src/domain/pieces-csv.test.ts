import { describe, expect, it } from "vitest";

import { toCents } from "./money";
import { piecesCsv, type CsvPiece } from "./pieces-csv";

const piece: CsvPiece = {
  restorationCode: "RES-00012",
  code: "PZ-0001",
  clientName: 'Ana "la Joyera", S.A.',
  description: "Jarra",
  quantity: 2,
  serviceName: "Limpieza",
  materialName: "Plata",
  measure: "10 cm",
  weightGrams: 120,
  status: "entregada",
  location: "entregada",
  urgent: true,
  workshopName: "Taller Sur",
  workshopDays: 5,
  estimatedDeliveryDate: "2026-11-20",
  workshopDeliveryDate: null,
  registeredAt: "2026-11-02T15:30:00Z",
  finishedAt: "2026-11-10T20:00:00Z",
  serviceCostCents: toCents(40),
  priceCents: toCents(100.5),
};

const lines = (csv: string) => csv.replace(/^﻿/, "").trim().split("\r\n");

describe("CSV de piezas", () => {
  it("incluye todas las columnas para quien ve cliente, costo y precio", () => {
    const [header, row] = lines(
      piecesCsv([piece], { showClient: true, showCost: true, showPrice: true }),
    );
    expect(header).toContain("Cliente");
    expect(header).toContain("Costo de servicio");
    expect(header).toContain("Precio de venta");
    expect(row).toContain('"Ana ""la Joyera"", S.A."');
    expect(row).toContain("RES-00012,PZ-0001");
    expect(row).toContain("2026-11-02 10:30");
    expect(row).toContain("2026-11-10");
    expect(row).toContain("40.00");
    expect(row).toContain("100.50");
    expect(row).toContain("Sí");
  });

  it("deja fuera lo que el rol no ve", () => {
    const [header, row] = lines(
      piecesCsv([piece], {
        showClient: false,
        showCost: false,
        showPrice: false,
      }),
    );
    expect(header).not.toContain("Cliente");
    expect(header).not.toContain("Costo de servicio");
    expect(header).not.toContain("Precio de venta");
    expect(row).not.toContain("Joyera");
    expect(row).not.toContain("100.50");
  });

  it("deja vacías las fechas que no hay y escribe BOM y CRLF", () => {
    const csv = piecesCsv(
      [{ ...piece, finishedAt: null, registeredAt: null, priceCents: null }],
      { showClient: true, showCost: true, showPrice: true },
    );
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(lines(csv)[1]).toContain(",,");
  });
});
