import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  idArg,
  idsArg,
  optionalIdArg,
  textArg,
  validArgs,
} from "./action-args";

const ID = "00000000-0000-0000-0000-00000000ca41";

describe("validArgs", () => {
  it("acepta argumentos con la forma esperada", () => {
    expect(
      validArgs([optionalIdArg, idsArg, textArg], [null, [ID], "nota"]),
    ).toBe(true);
  });

  it("rechaza ids que no son uuid, tipos cambiados y argumentos de más", () => {
    expect(validArgs([idArg], ["1; drop table pieces"])).toBe(false);
    expect(validArgs([idsArg], [ID])).toBe(false);
    expect(validArgs([textArg], [{ toString: "x" }])).toBe(false);
    expect(validArgs([idArg], [ID, "extra"])).toBe(false);
  });

  it("limita el tamaño de las listas y los textos", () => {
    expect(validArgs([idsArg], [Array(1001).fill(ID)])).toBe(false);
    expect(validArgs([textArg], ["x".repeat(5001)])).toBe(false);
  });

  it("acepta esquemas propios de la acción", () => {
    expect(validArgs([z.enum(["a", "b"])], ["a"])).toBe(true);
    expect(validArgs([z.enum(["a", "b"])], ["c"])).toBe(false);
  });
});
