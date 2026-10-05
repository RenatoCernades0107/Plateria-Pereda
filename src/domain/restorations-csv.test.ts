import { describe, expect, it } from "vitest";

import { restorationsCsv } from "./restorations-csv";

describe("restorationsCsv", () => {
  it("arma el CSV con BOM, encabezados y montos en soles", () => {
    const csv = restorationsCsv([
      {
        code: "RES-00001",
        clientName: 'Joyería "Andina", S.A.C.',
        documentNumber: "20100047218",
        contactName: null,
        status: "en_proceso",
        paymentStatus: "parcial",
        paymentType: "a_cuenta",
        piecesCount: 3,
        totalCents: 123450,
        paidCents: 61725,
        balanceCents: 61725,
        createdAt: "2026-10-01T03:00:00Z",
      },
    ]);
    expect(csv.startsWith("﻿Código,Fecha,Cliente")).toBe(true);
    const [, row] = csv.slice(1).split("\r\n");
    expect(row).toBe(
      'RES-00001,2026-09-30,"Joyería ""Andina"", S.A.C.",20100047218,,En proceso,Pago parcial,A cuenta,3,1234.50,617.25,617.25',
    );
  });

  it("sin montos (logística) deja las columnas vacías", () => {
    const csv = restorationsCsv([
      {
        code: "RES-00002",
        clientName: "Ana",
        documentNumber: null,
        contactName: "Luis",
        status: "registrada",
        paymentStatus: null,
        paymentType: "contado",
        piecesCount: 1,
        totalCents: null,
        paidCents: null,
        balanceCents: null,
        createdAt: "2026-10-01T15:00:00Z",
      },
    ]);
    expect(csv).toContain(
      "RES-00002,2026-10-01,Ana,,Luis,Registrada,,Al contado,1,,,",
    );
  });
});
