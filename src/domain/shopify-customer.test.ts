import { describe, expect, it } from "vitest";

import { personFromShopify } from "./shopify-customer";

const base = {
  firstName: "Ana",
  lastName: "Pérez",
  email: "Ana@Correo.pe",
  phone: "+51999888777",
  note: "  Cliente frecuente ",
};

describe("personFromShopify", () => {
  it("normaliza nombres, email y notas", () => {
    expect(personFromShopify({ ...base, firstName: "  Ana   María " })).toEqual(
      {
        firstName: "Ana María",
        lastName: "Pérez",
        email: "ana@correo.pe",
        phone: "+51999888777",
        notes: "Cliente frecuente",
      },
    );
  });

  it("sin nombres usa apellidos, email, teléfono o un nombre genérico", () => {
    expect(personFromShopify({ ...base, firstName: "" })).toMatchObject({
      firstName: "Pérez",
      lastName: "",
    });
    expect(
      personFromShopify({ ...base, firstName: "", lastName: "" }).firstName,
    ).toBe("ana");
    expect(
      personFromShopify({ ...base, firstName: "", lastName: "", email: null })
        .firstName,
    ).toBe("+51999888777");
    expect(
      personFromShopify({
        firstName: "",
        lastName: "",
        email: null,
        phone: null,
        note: "",
      }).firstName,
    ).toBe("Cliente de Shopify");
  });

  it("descarta email y teléfono inválidos y recorta textos largos", () => {
    const person = personFromShopify({
      ...base,
      email: "sin-arroba",
      phone: "999 888 777",
      lastName: "x".repeat(150),
      note: "n".repeat(3000),
    });
    expect(person.email).toBeNull();
    expect(person.phone).toBeNull();
    expect(person.lastName).toHaveLength(100);
    expect(person.notes).toHaveLength(2000);
  });
});
