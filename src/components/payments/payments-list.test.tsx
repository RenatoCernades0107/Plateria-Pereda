import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { PaymentRecord } from "@/server/payments/queries";

import { PaymentsList } from "./payments-list";

const payment = (overrides: Partial<PaymentRecord>): PaymentRecord => ({
  id: "p1",
  kind: "pago",
  amountCents: 20000,
  methodName: "Yape",
  branchName: null,
  paidOn: "2026-10-12",
  reason: "",
  source: "sistema",
  syncedToShopify: true,
  skipShopify: false,
  orderTitle: null,
  orderName: null,
  orderUrl: null,
  refundedPaymentId: null,
  refundableCents: 0,
  createdByName: "Vera Ventas",
  createdAt: "2026-10-12T15:00:00Z",
  ...overrides,
});

describe("PaymentsList (11.4)", () => {
  it("un pago registrado solo en el sistema lo dice", () => {
    render(<PaymentsList payments={[payment({ skipShopify: true })]} />);
    expect(screen.getByText("Solo en el sistema")).toBeInTheDocument();
  });

  it("muestra método, fecha, monto, quién lo registró y su envío a Shopify", () => {
    render(
      <PaymentsList
        payments={[
          payment({}),
          payment({ id: "p2", syncedToShopify: false, methodName: "Efectivo" }),
          payment({
            id: "p3",
            source: "shopify",
            createdByName: null,
            methodName: "Efectivo",
            amountCents: 5000,
          }),
          payment({
            id: "p4",
            kind: "reembolso",
            amountCents: 3000,
            reason: "Cobro de más",
            createdByName: "Ada Admin",
          }),
        ]}
      />,
    );
    const rows = screen.getAllByTestId("pago");
    expect(rows).toHaveLength(4);
    expect(rows[0]).toHaveTextContent("Yape");
    expect(rows[0]).toHaveTextContent("S/ 200.00");
    expect(rows[0]).toHaveTextContent("Vera Ventas");
    expect(rows[0]).toHaveTextContent("En Shopify");
    expect(rows[1]).toHaveTextContent("Pendiente de envío");
    expect(rows[2]).toHaveTextContent("Hecho en Shopify");
    // El estado de Shopify lleva su logotipo; el verde solo si ya llegó a Shopify.
    expect(rows[0]!.querySelector('svg[data-icon="shopify"]')).not.toBeNull();
    expect(within(rows[0]!).getByText("En Shopify")).toHaveClass(
      "bg-shopify/15",
    );
    expect(within(rows[1]!).getByText("Pendiente de envío")).not.toHaveClass(
      "bg-shopify/15",
    );
    expect(within(rows[3]!).getByText("Reembolso")).toBeInTheDocument();
    expect(rows[3]).toHaveTextContent("Cobro de más");
    expect(rows[3]).toHaveTextContent("−S/ 30.00");
  });

  it("con un pedido por pago muestra el pedido de cada uno, con enlace a Shopify", () => {
    render(
      <PaymentsList
        payments={[
          payment({
            orderTitle: "Adelanto Guía RES-00043 A1",
            orderName: "#1045",
            orderUrl: "https://pereda.myshopify.com/admin/orders/77",
          }),
          payment({
            id: "p2",
            syncedToShopify: false,
            orderTitle: "Saldo Guía RES-00043",
          }),
          payment({
            id: "p3",
            kind: "reembolso",
            amountCents: 5000,
            reason: "Cobro de más",
            refundedPaymentId: "p1",
          }),
        ]}
      />,
    );
    const rows = screen.getAllByTestId("pago");
    expect(within(rows[0]!).getByTestId("pedido-shopify")).toHaveAttribute(
      "href",
      "https://pereda.myshopify.com/admin/orders/77",
    );
    // La descripción del pedido es el texto del enlace; el número es el de Shopify.
    expect(rows[0]).toHaveTextContent("Adelanto Guía RES-00043 A1");
    expect(rows[0]).toHaveTextContent("Pedido #1045");
    expect(rows[1]).toHaveTextContent("Pendiente de envío");
    expect(rows[1]).toHaveTextContent("Saldo Guía RES-00043");
    expect(rows[2]).toHaveTextContent("De Adelanto Guía RES-00043 A1");
  });

  it("sin pagos lo dice", () => {
    render(<PaymentsList payments={[]} />);
    expect(
      screen.getByText("Aún no hay pagos registrados."),
    ).toBeInTheDocument();
  });
});
