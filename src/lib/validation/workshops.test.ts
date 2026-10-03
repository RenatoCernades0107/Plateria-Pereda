import { describe, expect, it } from "vitest";

import { workshopSchema } from "./workshops";

const valid = {
  name: "  Taller Rímac ",
  contactName: "Don José",
  phone: "+51 (1) 999-111-222",
  address: "",
  notes: "",
};

describe("workshopSchema", () => {
  it("acepta un taller válido y recorta los textos", () => {
    expect(workshopSchema.parse(valid).name).toBe("Taller Rímac");
  });

  it("solo el nombre es obligatorio", () => {
    expect(
      workshopSchema.safeParse({ ...valid, contactName: "", phone: "" })
        .success,
    ).toBe(true);
  });

  it.each([
    [{ name: " a " }, "Ingresa el nombre del taller"],
    [{ name: "x".repeat(101) }, "Máximo 100 caracteres"],
    [{ phone: "999-abc" }, "Usa solo números, espacios, +, - y paréntesis"],
    [{ notes: "x".repeat(2001) }, "Máximo 2000 caracteres"],
  ])("rechaza %j", (input, message) => {
    const result = workshopSchema.safeParse({ ...valid, ...input });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(message);
  });
});
