import { describe, expect, it } from "vitest";

import { isValidRuc } from "./ruc";

describe("isValidRuc", () => {
  it.each(["20100047218", "20131312955", "10467793549"])(
    "acepta el RUC válido %s",
    (ruc) => {
      expect(isValidRuc(ruc)).toBe(true);
    },
  );

  it.each([
    ["dígito verificador incorrecto", "20100047219"],
    ["prefijo inexistente", "30100047218"],
    ["menos de 11 dígitos", "2010004721"],
    ["letras", "2010004721A"],
    ["vacío", ""],
  ])("rechaza un RUC con %s", (_, ruc) => {
    expect(isValidRuc(ruc)).toBe(false);
  });
});
