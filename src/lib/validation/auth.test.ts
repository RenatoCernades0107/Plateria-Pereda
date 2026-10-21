import { describe, expect, it } from "vitest";

import { loginSchema } from "./auth";

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
