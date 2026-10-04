import { describe, expect, it } from "vitest";

import { clientSchema, contactSchema } from "./clients";

const person = {
  kind: "persona" as const,
  firstName: "  Ana   María ",
  lastName: "Pérez",
  document: { documentType: "dni" as const, documentNumber: "4567 8912" },
  phone: "999 888 777",
  email: " ANA@Correo.pe ",
  address: "",
  notes: "",
};

const company = {
  kind: "empresa" as const,
  legalName: " Joyería Andina S.A.C. ",
  ruc: "20100047218",
  phone: "(01) 234-5678",
  email: "",
  address: "Av. Larco 123",
  notes: "",
};

const errorsOf = (
  schema: typeof clientSchema | typeof contactSchema,
  input: unknown,
) => {
  const result = schema.safeParse(input);
  return result.success
    ? {}
    : Object.fromEntries(
        result.error.issues.map((i) => [i.path.join("."), i.message]),
      );
};

describe("clientSchema: persona", () => {
  it("normaliza nombres, documento, teléfono y email", () => {
    expect(clientSchema.parse(person)).toEqual({
      kind: "persona",
      firstName: "Ana María",
      lastName: "Pérez",
      documentType: "dni",
      documentNumber: "45678912",
      phone: "+51999888777",
      email: "ana@correo.pe",
      address: "",
      notes: "",
    });
  });

  it("el documento y el email son opcionales", () => {
    expect(
      clientSchema.parse({
        ...person,
        document: { documentType: null, documentNumber: "" },
        email: "",
      }),
    ).toMatchObject({ documentType: null, documentNumber: null, email: null });
  });

  it.each([
    [{ firstName: " " }, "firstName", "Ingresa los nombres"],
    [{ lastName: "" }, "lastName", "Ingresa los apellidos"],
    [{ phone: "" }, "phone", "Ingresa un teléfono"],
    [
      { phone: "12" },
      "phone",
      "Ingresa un teléfono válido (celular de 9 dígitos o fijo con código)",
    ],
    [{ email: "ana@" }, "email", "Ingresa un email válido"],
    [
      { document: { documentType: "dni", documentNumber: "123" } },
      "document.documentNumber",
      "El DNI tiene 8 dígitos",
    ],
    [
      { document: { documentType: "ce", documentNumber: "123" } },
      "document.documentNumber",
      "El carné de extranjería tiene de 9 a 12 dígitos",
    ],
    [
      { document: { documentType: "pasaporte", documentNumber: "1" } },
      "document.documentNumber",
      "El pasaporte tiene de 6 a 12 letras o números",
    ],
    [
      { document: { documentType: null, documentNumber: "45678912" } },
      "document.documentType",
      "Elige el tipo de documento",
    ],
    [
      { document: { documentType: "dni", documentNumber: " " } },
      "document.documentNumber",
      "Ingresa el número de documento",
    ],
  ])("rechaza %j", (patch, path, message) => {
    expect(errorsOf(clientSchema, { ...person, ...patch })[path]).toBe(message);
  });
});

describe("clientSchema: empresa", () => {
  it("usa el RUC como documento y normaliza el fijo de Lima", () => {
    expect(clientSchema.parse(company)).toEqual({
      kind: "empresa",
      legalName: "Joyería Andina S.A.C.",
      documentType: "ruc",
      documentNumber: "20100047218",
      phone: "+5112345678",
      email: null,
      address: "Av. Larco 123",
      notes: "",
    });
  });

  it.each([
    [{ legalName: "" }, "legalName", "Ingresa la razón social"],
    [{ ruc: "" }, "ruc", "Ingresa el RUC"],
    [{ ruc: "20100047219" }, "ruc", "Ingresa un RUC válido"],
  ])("rechaza %j", (patch, path, message) => {
    expect(errorsOf(clientSchema, { ...company, ...patch })[path]).toBe(
      message,
    );
  });
});

describe("contactSchema", () => {
  it("solo exige nombre y teléfono", () => {
    expect(
      contactSchema.parse({
        firstName: " Luis ",
        lastName: "",
        position: "Gerente",
        document: { documentType: null, documentNumber: "" },
        phone: "988777666",
        email: "",
      }),
    ).toEqual({
      firstName: "Luis",
      lastName: "",
      position: "Gerente",
      documentType: null,
      documentNumber: null,
      phone: "+51988777666",
      email: null,
    });
  });

  it("rechaza un contacto sin nombre ni teléfono", () => {
    expect(
      errorsOf(contactSchema, {
        firstName: "",
        lastName: "",
        position: "",
        document: { documentType: null, documentNumber: "" },
        phone: "",
        email: "",
      }),
    ).toMatchObject({
      firstName: "Ingresa el nombre",
      phone: "Ingresa un teléfono",
    });
  });
});
