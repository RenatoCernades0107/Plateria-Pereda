import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { PaymentListPage } from "@/server/payments/queries";

import { AllPaymentsTable } from "./all-payments-table";

const pago: PaymentListPage["items"][number] = {
  id: "p1",
  restorationId: "r1",
  restorationCode: "RES-00012",
  clientId: "c1",
  clientName: "Ana Pérez",
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
  orderUrl: "https://admin.shopify.com/store/x/orders/1",
  createdByName: "Vera Ventas",
  createdAt: "2026-10-05T20:30:00Z",
};

describe("AllPaymentsTable", () => {
  it("muestra cada pago con su restauración, método, monto y pedido", () => {
    render(<AllPaymentsTable payments={[pago]} empty="Vacío" />);
    const row = screen.getByTestId("pago-p1");
    expect(
      within(row).getByRole("link", { name: "RES-00012" }),
    ).toHaveAttribute("href", "/restauraciones/r1");
    expect(row).toHaveTextContent("Ana Pérez");
    expect(row).toHaveTextContent("Miraflores");
    expect(row).toHaveTextContent("S/ 150.50");
    expect(row).toHaveTextContent("Adelanto Guía RES-00012 A1");
    expect(
      within(row).getByRole("link", { name: /Pedido #1043/ }),
    ).toHaveAttribute("href", pago.orderUrl);
    expect(screen.getByTestId("pago-movil-p1")).toHaveTextContent("Yape");
  });

  it("los reembolsos restan y muestran su motivo", () => {
    render(
      <AllPaymentsTable
        payments={[
          {
            ...pago,
            kind: "reembolso",
            amountCents: 5000,
            reason: "Sin arreglo",
          },
        ]}
        empty="Vacío"
      />,
    );
    const row = screen.getByTestId("pago-p1");
    expect(row).toHaveTextContent("−S/ 50.00");
    expect(row).toHaveTextContent("Reembolso");
    expect(row).toHaveTextContent("Sin arreglo");
  });

  it("sin pagos muestra el vacío", () => {
    render(<AllPaymentsTable payments={[]} empty="No hay pagos." />);
    expect(screen.getByText("No hay pagos.")).toBeInTheDocument();
  });
});
