import { describe, expect, it } from "vitest";

import { newUserSchema } from "./users";

describe("newUserSchema", () => {
  it("normaliza nombre y email", () => {
    expect(
      newUserSchema.parse({
        fullName: "  Lola Logística ",
        email: " Lola@Pereda.TEST",
        role: "logistica",
        password: "Clave-de-lola-123",
      }),
    ).toEqual({
      fullName: "Lola Logística",
      email: "lola@pereda.test",
      role: "logistica",
      password: "Clave-de-lola-123",
    });
  });

  it("exige nombre, email válido, un rol conocido y una contraseña de 8 o más", () => {
    const result = newUserSchema.safeParse({
      fullName: "L",
      email: "x",
      role: "jefe",
      password: "corta",
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
      password: "Debe tener al menos 8 caracteres",
    });
  });
});
