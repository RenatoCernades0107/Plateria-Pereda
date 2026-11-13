import { describe, expect, it } from "vitest";

import {
  MAX_INVOICE_NUMBER_LENGTH,
  parseInvoiceNumber,
  quoteBalance,
  quotePaymentStatus,
} from "./quote-payments";

describe("pagos de cotización", () => {
  it("el estado de pago es Pendiente, Parcial o Pagado", () => {
    expect(quotePaymentStatus(10000, 0)).toBe("pendiente");
    expect(quotePaymentStatus(10000, 4000)).toBe("parcial");
    expect(quotePaymentStatus(10000, 10000)).toBe("pagado");
  });

  it("el saldo nunca es negativo", () => {
    expect(quoteBalance(10000, 4000)).toBe(6000);
    expect(quoteBalance(10000, 12000)).toBe(0);
  });

  it("limpia el número de factura", () => {
    expect(parseInvoiceNumber("  F001-123  ")).toEqual({ value: "F001-123" });
    expect(parseInvoiceNumber("F001   123")).toEqual({ value: "F001 123" });
  });

  it("vacío significa sin factura", () => {
    expect(parseInvoiceNumber("   ")).toEqual({ value: null });
  });

  it("rechaza un número demasiado largo", () => {
    expect(parseInvoiceNumber("F".repeat(MAX_INVOICE_NUMBER_LENGTH))).toEqual({
      value: "F".repeat(MAX_INVOICE_NUMBER_LENGTH),
    });
    expect(
      "error" in parseInvoiceNumber("F".repeat(MAX_INVOICE_NUMBER_LENGTH + 1)),
    ).toBe(true);
  });
});
