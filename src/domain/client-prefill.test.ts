import { describe, expect, it } from "vitest";

import { prefillFromSearch } from "./client-prefill";

describe("prefillFromSearch", () => {
  it.each([
    ["María Fernández", { field: "name", value: "María Fernández" }],
    ["  Joyería Sol  ", { field: "name", value: "Joyería Sol" }],
    ["20512345678", { field: "ruc", value: "20512345678" }],
    ["205123", { field: "ruc", value: "205123" }],
    ["987111222", { field: "phone", value: "+51 987111222" }],
    ["987 111 222", { field: "phone", value: "+51 987111222" }],
    ["+51 987 111 222", { field: "phone", value: "+51 987111222" }],
    // Números que no son RUC ni celular: se dejan como nombre.
    ["98711122", { field: "name", value: "98711122" }],
    ["70123456", { field: "name", value: "70123456" }],
    ["Calle 20", { field: "name", value: "Calle 20" }],
  ])("%j", (query, expected) => {
    expect(prefillFromSearch(query)).toEqual(expected);
  });

  it("sin texto no propone nada", () => {
    expect(prefillFromSearch("   ")).toBeNull();
  });
});
