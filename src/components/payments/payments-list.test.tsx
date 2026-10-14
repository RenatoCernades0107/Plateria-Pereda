import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { PaymentRecord } from "@/server/payments/queries";

import { PaymentsList } from "./payments-list";

const payment = (overrides: Partial<PaymentRecord>): PaymentRecord => ({
  id: "p1",
  kind: "pago",
  amountCents: 20000,
  methodName: "Yape",
  paidOn: "2026-10-12",
  reason: "",
  source: "sistema",
  syncedToShopify: true,
  createdByName: "Vera Ventas",
  createdAt: "2026-10-12T15:00:00Z",
  ...overrides,
});

describe("PaymentsList (11.4)", () => {
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

  it("sin pagos lo dice", () => {
    render(<PaymentsList payments={[]} />);
    expect(
      screen.getByText("Aún no hay pagos registrados."),
    ).toBeInTheDocument();
  });
});
