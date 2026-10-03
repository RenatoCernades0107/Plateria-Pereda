import { describe, expect, it } from "vitest";

import { fromCents, toCents } from "./money";

describe("montos", () => {
  it.each([
    ["200", 20000],
    ["200.5", 20050],
    ["0.05", 5],
    ["-10.10", -1010],
  ])("%s son %i céntimos", (amount, cents) => {
    expect(toCents(amount)).toBe(cents);
  });

  it("rechaza montos con más de dos decimales o texto", () => {
    expect(() => toCents("1.234")).toThrow("Monto inválido");
    expect(() => toCents("abc")).toThrow("Monto inválido");
  });

  it.each([
    [20050, "200.50"],
    [5, "0.05"],
    [0, "0.00"],
    [-1010, "-10.10"],
  ])("%i céntimos son %s", (cents, amount) => {
    expect(fromCents(cents)).toBe(amount);
  });
});
