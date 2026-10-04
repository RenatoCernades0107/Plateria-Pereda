import { describe, expect, it } from "vitest";

import { isCatalogKind } from "@/domain/catalogs";

import { catalogItemSchema } from "./catalogs";

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

describe("isCatalogKind", () => {
  it("solo acepta los catálogos conocidos", () => {
    expect(isCatalogKind("services")).toBe(true);
    expect(isCatalogKind("profiles")).toBe(false);
  });
});
