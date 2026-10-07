import { describe, expect, it } from "vitest";

import {
  expectedDeposit,
  formatCents,
  MAX_CENTS,
  parseMoney,
  PAYMENT_TYPE_LABELS,
  PAYMENT_TYPES,
  percentOf,
  sumCents,
  toCents,
  toDecimalString,
  toSoles,
} from "./money";

describe("conversión", () => {
  it("suma sin errores de punto flotante", () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(sumCents([toCents(0.1), toCents(0.2)])).toBe(30);
    expect(toSoles(sumCents([toCents(0.1), toCents(0.2)]))).toBe(0.3);
    expect(toCents(0.1 + 0.2)).toBe(30);
  });

  it("redondea a 2 decimales, alejando del cero los empates", () => {
    expect(toCents(1.005)).toBe(101);
    expect(toCents(1.004)).toBe(100);
    expect(toCents(2.675)).toBe(268);
    expect(toCents(-1.005)).toBe(-101);
    expect(toCents(12.5)).toBe(1250);
    expect(toCents(0)).toBe(0);
    expect(Object.is(toCents(-0.001), 0)).toBe(true);
  });

  it("muchas sumas pequeñas no acumulan error", () => {
    const precios = Array.from({ length: 1000 }, () => toCents(0.1));
    expect(sumCents(precios)).toBe(10_000);
    expect(sumCents([])).toBe(0);
  });

  it("da el texto decimal que piden la BD y Shopify", () => {
    expect(toDecimalString(123_450)).toBe("1234.50");
    expect(toDecimalString(5)).toBe("0.05");
    expect(toDecimalString(0)).toBe("0.00");
    expect(toDecimalString(-1_050)).toBe("-10.50");
    expect(toDecimalString(MAX_CENTS)).toBe("99999999.99");
  });

  it("formatea en soles", () => {
    expect(formatCents(123_450)).toBe("S/ 1,234.50");
    expect(formatCents(0)).toBe("S/ 0.00");
  });
});

describe("percentOf", () => {
  it("redondea a céntimos", () => {
    expect(percentOf(33_333, 50)).toBe(16_667);
    expect(percentOf(40_000, 50)).toBe(20_000);
    expect(percentOf(10_000, 33.33)).toBe(3_333);
    expect(percentOf(999, 100)).toBe(999);
    expect(percentOf(0, 50)).toBe(0);
  });
});

describe("parseMoney", () => {
  it.each([
    ["1234.5", 123_450],
    ["1234,50", 123_450],
    ["1,234.50", 123_450],
    ["1,234,567", 123_456_700],
    ["S/ 12", 1_200],
    ["s/12.3", 1_230],
    ["  0  ", 0],
    ["0.05", 5],
    ["99999999.99", MAX_CENTS],
  ])("%s → %i céntimos", (text, cents) => {
    expect(parseMoney(text)).toBe(cents);
  });

  it.each([
    "",
    "abc",
    "-5",
    "1.234",
    "12.345",
    "1,23,456",
    "1.234,50",
    "100000000",
    "12 soles",
  ])("rechaza %j", (text) => {
    expect(parseMoney(text)).toBeNull();
  });
});

describe("adelanto esperado", () => {
  const TOTAL = 40_000; // S/ 400.00

  it("al contado es el total", () => {
    expect(expectedDeposit(TOTAL, "contado")).toBe(TOTAL);
  });

  it("a cuenta es el 50 % por defecto", () => {
    expect(expectedDeposit(TOTAL, "a_cuenta")).toBe(20_000);
  });

  it("a cuenta usa el % de la restauración, redondeado a céntimos", () => {
    expect(expectedDeposit(TOTAL, "a_cuenta", 30)).toBe(12_000);
    expect(expectedDeposit(33_333, "a_cuenta", 50)).toBe(16_667);
    expect(expectedDeposit(TOTAL, "a_cuenta", 100)).toBe(TOTAL);
  });

  it("al crédito no hay adelanto", () => {
    expect(expectedDeposit(TOTAL, "credito", 50)).toBe(0);
  });

  it("todos los tipos de pago tienen etiqueta", () => {
    expect(Object.keys(PAYMENT_TYPE_LABELS).sort()).toEqual(
      [...PAYMENT_TYPES].sort(),
    );
  });
});

describe("tipo de pago por definir", () => {
  it("no espera adelanto", () => {
    expect(expectedDeposit(20_000, "sin_definir")).toBe(0);
    expect(expectedDeposit(20_000, "sin_definir", 50)).toBe(0);
  });
});
