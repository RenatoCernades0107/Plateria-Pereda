import { describe, expect, it } from "vitest";

import { newUserSchema } from "./users";

describe("newUserSchema", () => {
  it("normaliza nombre y email", () => {
    expect(
      newUserSchema.parse({
        fullName: "  Lola Logística ",
        email: " Lola@Pereda.TEST",
        role: "logistica",
      }),
    ).toEqual({
      fullName: "Lola Logística",
      email: "lola@pereda.test",
      role: "logistica",
    });
  });

  it("exige nombre, email válido y un rol conocido", () => {
    const result = newUserSchema.safeParse({
      fullName: "L",
      email: "x",
      role: "jefe",
    });
    expect(result.success).toBe(false);
    expect(
      Object.fromEntries(
        result.error!.issues.map((i) => [i.path[0], i.message]),
      ),
    ).toEqual({
      fullName: "Ingresa el nombre completo",
      email: "Ingresa un email válido",
      role: "Elige un rol",
    });
  });
});
