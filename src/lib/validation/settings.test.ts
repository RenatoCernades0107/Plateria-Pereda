import { describe, expect, it } from "vitest";

import { DEFAULT_WHATSAPP_TEMPLATE } from "@/domain/whatsapp-template";

import { logoFileError, settingsSchema } from "./settings";

const valid = {
  legalName: " Platería Pereda S.A.C. ",
  ruc: "20100047218",
  address: "Av. Larco 123, Miraflores",
  phones: "999 888 777",
  email: " Ventas@Pereda.PE ",
  quoteValidityDays: "15",
  depositPercent: "50",
  whatsappTemplate: DEFAULT_WHATSAPP_TEMPLATE,
  terms: "",
};

const errorsOf = (input: object) => {
  const result = settingsSchema.safeParse({ ...valid, ...input });
  return result.success
    ? {}
    : Object.fromEntries(
        result.error.issues.map((i) => [i.path.join("."), i.message]),
      );
};

describe("settingsSchema", () => {
  it("acepta datos válidos y los normaliza", () => {
    const result = settingsSchema.parse(valid);
    expect(result).toMatchObject({
      legalName: "Platería Pereda S.A.C.",
      email: "ventas@pereda.pe",
      quoteValidityDays: 15,
      depositPercent: 50,
    });
  });

  it("RUC y email son opcionales", () => {
    expect(errorsOf({ ruc: "", email: "" })).toEqual({});
  });

  it.each([
    [{ legalName: "  " }, "legalName", "Ingresa la razón social"],
    [{ ruc: "20100047219" }, "ruc", "Ingresa un RUC válido"],
    [{ email: "ventas@" }, "email", "Ingresa un email válido"],
    [
      { quoteValidityDays: "0" },
      "quoteValidityDays",
      "Debe ser al menos 1 día",
    ],
    [
      { quoteValidityDays: "1.5" },
      "quoteValidityDays",
      "Ingresa un número entero de días",
    ],
    [{ quoteValidityDays: "400" }, "quoteValidityDays", "Máximo 365 días"],
    [{ depositPercent: "0" }, "depositPercent", "Debe estar entre 1 y 100 %"],
    [
      { depositPercent: "100.5" },
      "depositPercent",
      "Debe estar entre 1 y 100 %",
    ],
    [{ depositPercent: "33.333" }, "depositPercent", "Máximo dos decimales"],
    [{ depositPercent: "abc" }, "depositPercent", "Ingresa un porcentaje"],
    [
      { whatsappTemplate: "Hola {clienet}, total {totl}" },
      "whatsappTemplate",
      "Variables desconocidas: {clienet}, {totl}",
    ],
  ])("rechaza %j", (input, path, message) => {
    expect(errorsOf(input)[path]).toBe(message);
  });

  it("acepta un adelanto con dos decimales", () => {
    expect(errorsOf({ depositPercent: "33.33" })).toEqual({});
  });
});

describe("logoFileError", () => {
  it("acepta PNG, JPG y WebP de hasta 2 MB", () => {
    expect(
      logoFileError({ type: "image/png", size: 2 * 1024 * 1024 }),
    ).toBeNull();
    expect(logoFileError({ type: "image/webp", size: 10 })).toBeNull();
  });

  it("rechaza otros formatos y archivos grandes", () => {
    expect(logoFileError({ type: "image/svg+xml", size: 10 })).toBe(
      "El logo debe ser PNG, JPG o WebP.",
    );
    expect(logoFileError({ type: "image/jpeg", size: 3 * 1024 * 1024 })).toBe(
      "El logo debe pesar como máximo 2 MB.",
    );
  });
});
