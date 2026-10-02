import { describe, expect, it } from "vitest";

import { formatDate, formatDateTime, formatMoney } from "./format";

describe("formatMoney", () => {
  it("usa soles con separador de miles y 2 decimales", () => {
    expect(formatMoney(1234.5)).toBe("S/ 1,234.50");
  });

  it("formatea cero y negativos", () => {
    expect(formatMoney(0)).toBe("S/ 0.00");
    expect(formatMoney(-1234.5)).toBe("-S/ 1,234.50");
  });

  it("redondea a 2 decimales", () => {
    expect(formatMoney(10.456)).toBe("S/ 10.46");
    expect(formatMoney(1234567.891)).toBe("S/ 1,234,567.89");
  });
});

describe("formatDate", () => {
  it("usa dd/mm/aaaa en hora de Lima, no UTC", () => {
    // 03:30 UTC del 3 de octubre = 22:30 del 2 de octubre en Lima
    expect(formatDate("2026-10-03T03:30:00Z")).toBe("02/10/2026");
    expect(formatDate("2026-10-03T05:30:00Z")).toBe("03/10/2026");
  });

  it("acepta objetos Date", () => {
    expect(formatDate(new Date("2026-01-15T12:00:00Z"))).toBe("15/01/2026");
  });
});

describe("formatDateTime", () => {
  it("incluye la hora en formato de 24 horas de Lima", () => {
    expect(formatDateTime("2026-10-03T05:30:00Z")).toBe("03/10/2026 00:30");
  });
});
