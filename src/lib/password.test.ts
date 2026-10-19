import { describe, expect, it } from "vitest";

import { generatePassword } from "./password";
import { userPasswordSchema } from "./validation/users";

describe("generatePassword", () => {
  it("genera tres grupos de 4 caracteres fáciles de leer", () => {
    const password = generatePassword();
    expect(password).toMatch(
      /^[a-km-zA-HJ-NP-Z2-9]{4}(-[a-km-zA-HJ-NP-Z2-9]{4}){2}$/,
    );
    expect(userPasswordSchema.safeParse(password).success).toBe(true);
  });

  it("no repite contraseñas", () => {
    expect(generatePassword()).not.toBe(generatePassword());
  });
});
