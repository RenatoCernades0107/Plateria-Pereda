import { describe, expect, it } from "vitest";

import {
  describePrefill,
  fixCapitals,
  prefillFromSearch,
} from "./client-prefill";

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
    ["ana@joyeria.pe", { email: "ana@joyeria.pe" }],
    ["Ana.Perez@Gmail.com", { email: "ana.perez@gmail.com" }],
    ["+1 415 555 2671", { phone: "+1 4155552671" }],
    ["+34 612 345 678", { phone: "+34 612345678" }],
    ["+51 1 234 5678", { phone: "+51 12345678" }],
    ["MARIA FERNANDEZ ROJAS", { name: "Maria Fernandez Rojas" }],
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

describe("fixCapitals", () => {
  it.each([
    ["MARIA FERNANDEZ", "Maria Fernandez"],
    ["maria fernandez", "Maria Fernandez"],
    ["MARÍA DE LA CRUZ", "María de la Cruz"],
    ["ana rojas-pérez", "Ana Rojas-Pérez"],
    ["luis d'angelo", "Luis D'Angelo"],
    ["JOYERIA EL SOL S.A.C.", "Joyeria El Sol S.A.C."],
    ["inversiones andinas sac", "Inversiones Andinas SAC"],
    // Si ya mezcla mayúsculas y minúsculas, se respeta.
    ["María Fernández", "María Fernández"],
    ["McDonald", "McDonald"],
    ["De la Cruz", "De la Cruz"],
  ])("%s → %s", (input, expected) => {
    expect(fixCapitals(input)).toBe(expected);
  });
});
