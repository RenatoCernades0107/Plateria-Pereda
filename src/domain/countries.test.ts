import { describe, expect, it } from "vitest";

import { joinPhone, splitPhone } from "./countries";
import { normalizePhone } from "./phone";

describe("splitPhone", () => {
  it("sin + asume Perú", () => {
    expect(splitPhone("999 888 777")).toEqual({
      iso: "PE",
      national: "999888777",
    });
    expect(splitPhone("")).toEqual({ iso: "PE", national: "" });
  });
  it("con + detecta el país por el prefijo más largo", () => {
    expect(splitPhone("+51 999 888 777")).toEqual({
      iso: "PE",
      national: "999888777",
    });
    expect(splitPhone("+591 71234567")).toEqual({
      iso: "BO",
      national: "71234567",
    });
    expect(splitPhone("+57 3001234567")).toEqual({
      iso: "CO",
      national: "3001234567",
    });
  });
});

describe("joinPhone", () => {
  it("compone un número que normalizePhone acepta", () => {
    expect(normalizePhone(joinPhone("PE", "999888777"))).toBe("+51999888777");
    expect(normalizePhone(joinPhone("PE", "012345678"))).toBe("+5112345678");
    expect(normalizePhone(joinPhone("CO", "3001234567"))).toBe("+573001234567");
  });
  it("sin número solo conserva un país distinto del predeterminado", () => {
    expect(joinPhone("PE", "")).toBe("");
    expect(joinPhone("CO", "")).toBe("+57");
  });
});
