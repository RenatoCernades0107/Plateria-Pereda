import { describe, expect, it } from "vitest";

import {
  loginSchema,
  recoverPasswordSchema,
  resetPasswordSchema,
} from "./auth";

function errores(result: {
  success: boolean;
  error?: { issues: { path: PropertyKey[]; message: string }[] };
}) {
  return Object.fromEntries(
    (result.error?.issues ?? []).map((i) => [String(i.path[0]), i.message]),
  );
}

describe("loginSchema", () => {
  it("normaliza el email", () => {
    const result = loginSchema.parse({
      email: "  Admin@Pereda.TEST ",
      password: "x",
    });
    expect(result.email).toBe("admin@pereda.test");
  });

  it("exige email válido y contraseña", () => {
    expect(
      errores(loginSchema.safeParse({ email: "admin", password: "" })),
    ).toEqual({
      email: "Ingresa un email válido",
      password: "Ingresa tu contraseña",
    });
  });
});

describe("recoverPasswordSchema", () => {
  it("exige un email válido", () => {
    expect(recoverPasswordSchema.safeParse({ email: "x" }).success).toBe(false);
    expect(recoverPasswordSchema.safeParse({ email: "x@y.pe" }).success).toBe(
      true,
    );
  });
});

describe("resetPasswordSchema", () => {
  it("exige 8 caracteres como mínimo", () => {
    expect(
      errores(
        resetPasswordSchema.safeParse({
          password: "corta",
          confirmPassword: "corta",
        }),
      ),
    ).toEqual({
      password: "Debe tener al menos 8 caracteres",
    });
  });

  it("exige que la confirmación coincida", () => {
    expect(
      errores(
        resetPasswordSchema.safeParse({
          password: "Clave-segura-1",
          confirmPassword: "Clave-segura-2",
        }),
      ),
    ).toEqual({ confirmPassword: "Las contraseñas no coinciden" });
  });
});
