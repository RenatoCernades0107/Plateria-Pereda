import { describe, expect, it } from "vitest";

import { isCatalogKind } from "@/domain/catalogs";

import { catalogItemSchema, catalogItemSchemaFor } from "./catalogs";

describe("catalogItemSchema", () => {
  it.each([
    ["", null],
    ["35", 35],
    ["35.5", 35.5],
    ["35,50", 35.5],
  ])("convierte el precio %j en %j", (price, expected) => {
    expect(catalogItemSchema.parse({ name: " Limpieza ", price })).toEqual({
      name: "Limpieza",
      price: expected,
    });
  });

  it.each([
    [{ name: " ", price: "" }, "Ingresa el nombre"],
    [
      { name: "Pulido", price: "-5" },
      "Ingresa un monto válido (hasta 2 decimales)",
    ],
    [
      { name: "Pulido", price: "10.999" },
      "Ingresa un monto válido (hasta 2 decimales)",
    ],
    [
      { name: "Pulido", price: "diez" },
      "Ingresa un monto válido (hasta 2 decimales)",
    ],
  ])("rechaza %j", (input, message) => {
    expect(catalogItemSchema.safeParse(input).error?.issues[0]?.message).toBe(
      message,
    );
  });
});

describe("catalogItemSchemaFor", () => {
  const branch = catalogItemSchemaFor("branches");
  const message = (name: string) =>
    branch.safeParse({ name, price: "" }).error?.issues[0]?.message;

  it("la sucursal va como etiqueta de Shopify: máximo 40 caracteres y sin comas", () => {
    expect(branch.parse({ name: " PEREDA 4TA - CAJA ", price: "" }).name).toBe(
      "PEREDA 4TA - CAJA",
    );
    expect(message("x".repeat(40))).toBeUndefined();
    expect(message("x".repeat(41))).toBe("Máximo 40 caracteres");
    expect(message("PEREDA, CAJA")).toBe(
      "Sin comas (Shopify las usa para separar etiquetas)",
    );
  });

  it("los demás catálogos no tienen ese límite", () => {
    expect(
      catalogItemSchemaFor("payment_methods").safeParse({
        name: "Pago, con coma",
        price: "",
      }).success,
    ).toBe(true);
  });
});

describe("isCatalogKind", () => {
  it("solo acepta los catálogos conocidos", () => {
    expect(isCatalogKind("services")).toBe(true);
    expect(isCatalogKind("profiles")).toBe(false);
  });
});
