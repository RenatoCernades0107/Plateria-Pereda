import { describe, expect, it } from "vitest";

import { isValidDocument, normalizeDocument } from "./documents";

describe("documentos de identidad", () => {
  it.each([
    ["dni", "45678912", true],
    ["dni", "4567891", false],
    ["dni", "4567891A", false],
    ["ce", "001234567", true],
    ["ce", "12345678", false],
    ["pasaporte", "AB123456", true],
    ["pasaporte", "AB1", false],
    ["ruc", "20100047218", true],
    ["ruc", "20100047219", false],
  ] as const)("%s %s → %s", (type, value, valid) => {
    expect(isValidDocument(type, value)).toBe(valid);
  });

  it("normaliza espacios, guiones y mayúsculas del pasaporte", () => {
    expect(normalizeDocument("dni", " 4567 8912 ")).toBe("45678912");
    expect(normalizeDocument("ruc", "20-100047218")).toBe("20100047218");
    expect(normalizeDocument("pasaporte", "ab 123-456")).toBe("AB123456");
  });
});
