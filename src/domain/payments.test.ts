import { describe, expect, it } from "vitest";

import { derivePaymentStatus, suggestedPayment } from "./payments";

describe("derivePaymentStatus (P29)", () => {
  it("Pendiente, Parcial y Pagado", () => {
    expect(derivePaymentStatus(40000, 0)).toBe("pendiente");
    expect(derivePaymentStatus(40000, 20000)).toBe("parcial");
    expect(derivePaymentStatus(40000, 40000)).toBe("pagado");
  });

  it("un sobrepago queda Pagado", () => {
    expect(derivePaymentStatus(40000, 45000)).toBe("pagado");
  });

  it("reembolso total → Reembolsado; parcial → recalcula", () => {
    expect(derivePaymentStatus(40000, 0, 20000)).toBe("reembolsado");
    expect(derivePaymentStatus(40000, 10000, 10000)).toBe("parcial");
    expect(derivePaymentStatus(40000, 40000, 5000)).toBe("pagado");
  });

  it("total 0 sin pagos queda Pendiente", () => {
    expect(derivePaymentStatus(0, 0)).toBe("pendiente");
  });
});

describe("suggestedPayment", () => {
  const base = { totalCents: 40000, paidCents: 0 };

  it("a cuenta: sugiere el adelanto (50 % u otro %) y luego el saldo", () => {
    expect(
      suggestedPayment({
        ...base,
        paymentType: "a_cuenta",
        expectedDepositCents: 20000,
      }),
    ).toEqual({ kind: "adelanto", amount: 20000 });
    expect(
      suggestedPayment({
        ...base,
        paymentType: "a_cuenta",
        expectedDepositCents: 24000,
        paidCents: 10000,
      }),
    ).toEqual({ kind: "adelanto", amount: 14000 });
    expect(
      suggestedPayment({
        ...base,
        paymentType: "a_cuenta",
        expectedDepositCents: 20000,
        paidCents: 20000,
      }),
    ).toEqual({ kind: "saldo", amount: 20000 });
  });

  it("al contado sugiere el total (P28); al crédito, el saldo", () => {
    expect(
      suggestedPayment({
        ...base,
        paymentType: "contado",
        expectedDepositCents: 40000,
      }),
    ).toEqual({ kind: "saldo", amount: 40000 });
    expect(
      suggestedPayment({
        ...base,
        paymentType: "credito",
        expectedDepositCents: 0,
        paidCents: 5000,
      }),
    ).toEqual({ kind: "saldo", amount: 35000 });
  });

  it("sin saldo no sugiere nada", () => {
    expect(
      suggestedPayment({
        ...base,
        paymentType: "contado",
        expectedDepositCents: 40000,
        paidCents: 40000,
      }),
    ).toBeNull();
  });
});
