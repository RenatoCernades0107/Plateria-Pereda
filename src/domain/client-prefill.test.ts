import { describe, expect, it } from "vitest";

import { describePrefill, prefillFromSearch } from "./client-prefill";

describe("prefillFromSearch", () => {
  it.each([
    ["María Fernández", { name: "María Fernández" }],
    ["  Joyería Sol  ", { name: "Joyería Sol" }],
    ["20512345678", { ruc: "20512345678" }],
    ["205123", { ruc: "205123" }],
    ["10701234565", { ruc: "10701234565", dni: "70123456" }],
    ["1070123", { ruc: "1070123" }],
    ["70123456", { dni: "70123456" }],
    ["7012 3456", { dni: "70123456" }],
    // 8 dígitos es DNI aunque empiece con 10 o 20.
    ["10234567", { dni: "10234567" }],
    ["20345678", { dni: "20345678" }],
    ["987111222", { phone: "+51 987111222" }],
    ["987 111 222", { phone: "+51 987111222" }],
    ["+51 987 111 222", { phone: "+51 987111222" }],
    // Números que no son DNI, RUC ni celular: se dejan como nombre.
    ["9871112", { name: "9871112" }],
    ["Calle 20", { name: "Calle 20" }],
  ])("%j", (query, expected) => {
    expect(prefillFromSearch(query)).toEqual(expected);
  });

  it("sin texto no propone nada", () => {
    expect(prefillFromSearch("   ")).toBeNull();
  });
});

describe("describePrefill", () => {
  it.each([
    [{ name: "Ana" }, "Nombre: Ana"],
    [{ dni: "70123456" }, "DNI: 70123456"],
    [{ ruc: "10701234565", dni: "70123456" }, "RUC: 10701234565"],
    [{ phone: "+51 987111222" }, "Teléfono: +51 987111222"],
  ])("%j → %s", (prefill, text) => {
    expect(describePrefill(prefill)).toBe(text);
  });
});
