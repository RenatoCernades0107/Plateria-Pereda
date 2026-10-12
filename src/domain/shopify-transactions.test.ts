import { describe, expect, it } from "vitest";

import {
  externalPayments,
  transactionToPayment,
  webhookOrderCustomer,
  webhookOrderId,
  type OrderTransaction,
} from "./shopify-transactions";

const tx = (overrides: Partial<OrderTransaction>): OrderTransaction => ({
  id: "gid://shopify/OrderTransaction/1",
  kind: "SALE",
  status: "SUCCESS",
  gateway: "cash",
  amountCents: 10000,
  processedAt: "2026-10-12T20:00:00Z",
  ...overrides,
});

describe("transactionToPayment (11.3)", () => {
  it("venta o captura exitosa → pago; reembolso → reembolso", () => {
    expect(transactionToPayment(tx({}))).toEqual({
      transactionId: "gid://shopify/OrderTransaction/1",
      kind: "pago",
      amountCents: 10000,
      methodName: "Efectivo",
      paidOn: "2026-10-12",
    });
    expect(transactionToPayment(tx({ kind: "CAPTURE" }))?.kind).toBe("pago");
    expect(transactionToPayment(tx({ kind: "REFUND" }))?.kind).toBe(
      "reembolso",
    );
  });

  it("las fallidas, pendientes y autorizaciones no cuentan", () => {
    expect(transactionToPayment(tx({ status: "FAILURE" }))).toBeNull();
    expect(transactionToPayment(tx({ status: "PENDING" }))).toBeNull();
    expect(transactionToPayment(tx({ kind: "AUTHORIZATION" }))).toBeNull();
    expect(transactionToPayment(tx({ kind: "VOID" }))).toBeNull();
  });

  it("la fecha es la de Lima y el método conserva el nombre de la pasarela", () => {
    expect(
      transactionToPayment(
        tx({ processedAt: "2026-10-13T03:00:00Z", gateway: "Yape" }),
      ),
    ).toMatchObject({ paidOn: "2026-10-12", methodName: "Yape" });
  });
});

describe("externalPayments", () => {
  it("solo las que el registro no tiene", () => {
    const list = [
      tx({ id: "a" }),
      tx({ id: "b", kind: "REFUND", amountCents: 500 }),
      tx({ id: "c", status: "FAILURE" }),
    ];
    expect(
      externalPayments(list, new Set(["a"])).map((p) => p.transactionId),
    ).toEqual(["b"]);
    // Repetir con todo ya contado no agrega nada.
    expect(externalPayments(list, new Set(["a", "b", "c"]))).toEqual([]);
  });
});

describe("webhooks de la orden", () => {
  it("toma la orden de cada topic", () => {
    expect(
      webhookOrderId("orders/paid", {
        id: 820982911946154500,
        admin_graphql_api_id: "gid://shopify/Order/820982911946154508",
      }),
    ).toBe("gid://shopify/Order/820982911946154508");
    expect(webhookOrderId("orders/updated", { id: 5 })).toBe(
      "gid://shopify/Order/5",
    );
    expect(webhookOrderId("order_transactions/create", { order_id: 7 })).toBe(
      "gid://shopify/Order/7",
    );
    expect(webhookOrderId("refunds/create", { order_id: "8" })).toBe(
      "gid://shopify/Order/8",
    );
    expect(webhookOrderId("refunds/create", {})).toBeNull();
  });

  it("el cliente de la orden, salvo en órdenes de empresa", () => {
    expect(
      webhookOrderCustomer({
        customer: {
          id: 9,
          first_name: "Ana",
          last_name: "Pérez",
          email: "ana@x.pe",
          phone: null,
        },
      }),
    ).toEqual({
      customerId: "gid://shopify/Customer/9",
      firstName: "Ana",
      lastName: "Pérez",
      email: "ana@x.pe",
      phone: null,
    });
    expect(
      webhookOrderCustomer({ company: { id: 1 }, customer: { id: 9 } }),
    ).toBeNull();
    expect(webhookOrderCustomer({ customer: null })).toBeNull();
  });
});
