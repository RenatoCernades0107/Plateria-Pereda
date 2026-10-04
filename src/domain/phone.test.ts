import { describe, expect, it } from "vitest";

import { formatPhone, normalizePhone } from "./phone";

describe("normalizePhone", () => {
  it.each([
    ["999 888 777", "+51999888777"],
    ["999-888-777", "+51999888777"],
    ["+51 999 888 777", "+51999888777"],
    ["51999888777", "+51999888777"],
    ["(01) 234-5678", "+5112345678"],
    ["2345678", null],
    ["12345678", "+5112345678"],
    ["044 123456", "+5144123456"],
    ["+1 415 555 2671", "+14155552671"],
    ["+51 44 123456", "+5144123456"],
  ])("%s → %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each([
    "",
    "   ",
    "abc",
    "99988877",
    "9998887771",
    "+51 12",
    "99+9888777",
    "+0 123456789",
  ])("rechaza %j", (input) => {
    expect(normalizePhone(input)).toBeNull();
  });
});

describe("formatPhone", () => {
  it("agrupa celulares y fijos de Lima; deja otros como están", () => {
    expect(formatPhone("+51999888777")).toBe("+51 999 888 777");
    expect(formatPhone("+5112345678")).toBe("+51 1 234 5678");
    expect(formatPhone("+14155552671")).toBe("+14155552671");
  });
});
