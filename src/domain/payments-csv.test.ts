import { describe, expect, it } from "vitest";

import { paymentsCsv, type PaymentListRow } from "./payments-csv";

const pago: PaymentListRow = {
  id: "p1",
  restorationId: "r1",
  restorationCode: "RES-00012",
  clientId: "c1",
  clientName: "Ana Pérez, hija",
  documentNumber: "12345678",
  kind: "pago",
  amountCents: 15050,
  methodName: "Yape",
  branchName: "Miraflores",
  paidOn: "2026-10-05",
  reason: "",
  source: "sistema",
  skipShopify: false,
  syncedToShopify: true,
  orderTitle: "Adelanto Guía RES-00012 A1",
  orderName: "#1043",
  createdByName: "Vera Ventas",
  createdAt: "2026-10-05T20:30:00Z",
};

describe("paymentsCsv", () => {
  it("arma el CSV con BOM, encabezados y una fila por pago", () => {
    const csv = paymentsCsv([pago]);
    expect(csv.startsWith("﻿Fecha de pago,Restauración,Cliente")).toBe(true);
    expect(csv).toContain(
      '2026-10-05,RES-00012,"Ana Pérez, hija",12345678,Pago,Yape,Miraflores,150.50,150.50,,Sistema,Adelanto Guía RES-00012 A1,#1043,Vera Ventas,2026-10-05 15:30',
    );
  });

  it("los reembolsos restan en la columna Neto y llevan su motivo", () => {
    const csv = paymentsCsv([
      {
        ...pago,
        id: "p2",
        kind: "reembolso",
        amountCents: 5000,
        reason: "Pieza sin arreglo",
        orderTitle: null,
        orderName: null,
        syncedToShopify: false,
      },
    ]);
    expect(csv).toContain(
      ",Reembolso,Yape,Miraflores,50.00,-50.00,Pieza sin arreglo,Sistema,Pendiente de envío,,",
    );
  });
});
