import { describe, expect, it } from "vitest";

import { netPaid, planPaymentSync, type SyncPayment } from "./payment-sync";

let n = 0;
const pay = (
  amountCents: number,
  gateway = "Efectivo",
  synced = false,
): SyncPayment => ({
  id: `p${++n}`,
  kind: "pago",
  amountCents,
  gateway,
  synced,
});
const refund = (
  amountCents: number,
  gateway = "Efectivo",
  synced = false,
): SyncPayment => ({ ...pay(amountCents, gateway, synced), kind: "reembolso" });

describe("planPaymentSync: con la orden creada", () => {
  it("el pago que completa el saldo se registra como pago completo", () => {
    const payments = [pay(20000, "Yape", true), pay(20000, "Plin")];
    expect(
      planPaymentSync({
        payments,
        totalCents: 40000,
        shopify: { receivedCents: 20000, outstandingCents: 20000 },
      }),
    ).toEqual({ kind: "record_full", gateway: "Plin", markSynced: true });
  });

  it("un pago intermedio queda pendiente", () => {
    expect(
      planPaymentSync({
        payments: [pay(20000, "Yape", true), pay(10000)],
        totalCents: 40000,
        shopify: { receivedCents: 20000, outstandingCents: 20000 },
      }),
    ).toEqual({ kind: "none", markSynced: false });
  });

  it("y llega con el pago que completa el saldo", () => {
    expect(
      planPaymentSync({
        payments: [pay(20000, "Yape", true), pay(10000), pay(10000, "Plin")],
        totalCents: 40000,
        shopify: { receivedCents: 20000, outstandingCents: 20000 },
      }).kind,
    ).toBe("record_full");
  });

  it("un reembolso de lo que Shopify ya cobró se reembolsa allá", () => {
    expect(
      planPaymentSync({
        payments: [pay(20000, "Yape", true), refund(5000, "Yape")],
        totalCents: 40000,
        shopify: { receivedCents: 20000, outstandingCents: 20000 },
      }),
    ).toEqual({
      kind: "refund",
      amountCents: 5000,
      gateway: "Yape",
      markSynced: true,
    });
  });

  it("un reembolso de un pago que aún no llegó a Shopify no se envía", () => {
    expect(
      planPaymentSync({
        payments: [pay(20000, "Yape", true), pay(10000), refund(10000)],
        totalCents: 40000,
        shopify: { receivedCents: 20000, outstandingCents: 20000 },
      }),
    ).toEqual({ kind: "none", markSynced: true });
  });

  it("repetir la conciliación no hace nada", () => {
    expect(
      planPaymentSync({
        payments: [pay(20000, "Yape", true), pay(20000, "Plin", true)],
        totalCents: 40000,
        shopify: { receivedCents: 40000, outstandingCents: 0 },
      }),
    ).toEqual({ kind: "none", markSynced: true });
  });

  it("netPaid resta los reembolsos", () => {
    expect(netPaid([pay(100), pay(50), refund(30)])).toBe(120);
  });
});
