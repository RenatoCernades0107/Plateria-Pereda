import { describe, expect, it } from "vitest";

import {
  MAX_PIECES,
  pieceSchema,
  restorationSchema,
  type PieceFormInput,
} from "./restorations";

const CLIENT = "6f1c9a52-1b7e-4c1a-9d3e-2a4b5c6d7e8f";
const CONTACT = "0e5d1f7a-3c2b-4a1d-8e9f-1a2b3c4d5e6f";
const WORKSHOP = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const SILVER = "1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e";

const piece: PieceFormInput = {
  workshopId: "",
  description: "  Bandeja   ovalada con asas ",
  measure: "40 × 30 cm",
  material: { id: SILVER, name: "Plata 950" },
  service: { id: null, name: " Limpieza y pulido " },
  weight: "850,5",
  price: "1,250.50",
  arrived: true,
  notes: "",
};

const restoration = {
  clientId: CLIENT,
  contactId: "",
  paymentType: "a_cuenta" as const,
  depositPercent: "50",
  notes: "",
  pieces: [piece],
};

const errorsOf = (
  schema: typeof pieceSchema | typeof restorationSchema,
  input: unknown,
) => {
  const result = schema.safeParse(input);
  return result.success
    ? {}
    : Object.fromEntries(
        result.error.issues.map((i) => [i.path.join("."), i.message]),
      );
};

describe("pieceSchema", () => {
  it("normaliza los textos y convierte precio y peso", () => {
    expect(pieceSchema.parse(piece)).toEqual({
      workshopId: null,
      description: "Bandeja ovalada con asas",
      measure: "40 × 30 cm",
      material: { id: SILVER, name: "Plata 950" },
      service: { id: null, name: "Limpieza y pulido" },
      weightGrams: 850.5,
      priceCents: 125_050,
      arrived: true,
      notes: "",
    });
  });

  it("solo exige descripción y precio (P22)", () => {
    expect(
      pieceSchema.parse({
        workshopId: null,
        description: "Cáliz",
        measure: "",
        material: { id: null, name: "" },
        service: { id: null, name: "" },
        weight: "",
        price: "0",
        arrived: false,
        notes: "",
      }),
    ).toEqual({
      workshopId: null,
      description: "Cáliz",
      measure: "",
      material: null,
      service: null,
      weightGrams: null,
      priceCents: 0,
      arrived: false,
      notes: "",
    });
  });

  it("guarda el taller elegido", () => {
    expect(pieceSchema.parse({ ...piece, workshopId: WORKSHOP })).toMatchObject(
      { workshopId: WORKSHOP },
    );
  });

  it("precio requerido y válido", () => {
    expect(errorsOf(pieceSchema, { ...piece, price: " " })).toEqual({
      price: "Ingresa el precio",
    });
    for (const price of ["-10", "12.345", "abc", "100000000"]) {
      expect(errorsOf(pieceSchema, { ...piece, price })).toEqual({
        price: "Ingresa un monto válido (hasta 2 decimales)",
      });
    }
  });

  it("peso opcional, positivo y con hasta 2 decimales", () => {
    for (const weight of ["-1", "1.234", "abc", "1234567"]) {
      expect(errorsOf(pieceSchema, { ...piece, weight })).toEqual({
        weight: "Ingresa el peso en gramos (hasta 2 decimales)",
      });
    }
    expect(errorsOf(pieceSchema, { ...piece, weight: "0" })).toEqual({
      weight: "El peso debe ser mayor que 0",
    });
  });

  it("descripción requerida", () => {
    expect(errorsOf(pieceSchema, { ...piece, description: "   " })).toEqual({
      description: "Describe la pieza (qué es y cómo está)",
    });
  });

  it("respeta las longitudes máximas", () => {
    expect(
      errorsOf(pieceSchema, {
        ...piece,
        description: "a".repeat(301),
        measure: "a".repeat(101),
        material: { id: null, name: "a".repeat(101) },
        notes: "a".repeat(1001),
      }),
    ).toEqual({
      description: "Máximo 300 caracteres",
      measure: "Máximo 100 caracteres",
      "material.name": "Máximo 100 caracteres",
      notes: "Máximo 1000 caracteres",
    });
  });

  it("un material del catálogo necesita su nombre", () => {
    expect(
      errorsOf(pieceSchema, { ...piece, material: { id: SILVER, name: " " } }),
    ).toEqual({ "material.name": "Escribe el nombre" });
  });

  it("rechaza ids inválidos", () => {
    expect(
      Object.keys(errorsOf(pieceSchema, { ...piece, workshopId: "taller-a" })),
    ).toEqual(["workshopId"]);
  });

  it("las notas conservan los saltos de línea", () => {
    expect(
      pieceSchema.parse({ ...piece, notes: " Falta una asa.\nTiene golpes. " })
        .notes,
    ).toBe("Falta una asa.\nTiene golpes.");
  });
});

describe("restorationSchema", () => {
  it("a cuenta guarda el % de adelanto", () => {
    const result = restorationSchema.parse(restoration);
    expect(result).toMatchObject({
      clientId: CLIENT,
      contactId: null,
      paymentType: "a_cuenta",
      depositPercent: 50,
      notes: "",
    });
    expect(result.pieces).toHaveLength(1);
  });

  it("acepta un % con hasta 2 decimales", () => {
    expect(
      restorationSchema.parse({ ...restoration, depositPercent: 33.33 })
        .depositPercent,
    ).toBe(33.33);
    expect(
      errorsOf(restorationSchema, { ...restoration, depositPercent: "33.333" }),
    ).toEqual({ depositPercent: "Máximo dos decimales" });
  });

  it.each(["0", "101", "", "abc"])("rechaza el %% %j", (depositPercent) => {
    expect(
      errorsOf(restorationSchema, { ...restoration, depositPercent }),
    ).toEqual({ depositPercent: "El adelanto debe estar entre 1 y 100 %" });
  });

  it.each(["contado", "credito"] as const)(
    "%s ignora el %% de adelanto",
    (paymentType) => {
      expect(
        restorationSchema.parse({
          ...restoration,
          paymentType,
          depositPercent: "",
          contactId: CONTACT,
        }),
      ).toMatchObject({
        paymentType,
        depositPercent: null,
        contactId: CONTACT,
      });
    },
  );

  it("exige cliente y al menos una pieza", () => {
    expect(
      errorsOf(restorationSchema, { ...restoration, clientId: "", pieces: [] }),
    ).toEqual({
      clientId: "Elige un cliente",
      pieces: "Agrega al menos una pieza",
    });
  });

  it("limita la cantidad de piezas", () => {
    expect(
      errorsOf(restorationSchema, {
        ...restoration,
        pieces: Array.from({ length: MAX_PIECES + 1 }, () => piece),
      }),
    ).toEqual({ pieces: `Máximo ${MAX_PIECES} piezas por restauración` });
  });

  it("muestra a la vez los errores de las piezas y del adelanto", () => {
    expect(
      errorsOf(restorationSchema, {
        ...restoration,
        depositPercent: "0",
        pieces: [piece, { ...piece, price: "", description: "" }],
      }),
    ).toEqual({
      depositPercent: "El adelanto debe estar entre 1 y 100 %",
      "pieces.1.price": "Ingresa el precio",
      "pieces.1.description": "Describe la pieza (qué es y cómo está)",
    });
  });

  it("rechaza un tipo de pago desconocido", () => {
    expect(
      restorationSchema.safeParse({ ...restoration, paymentType: "trueque" })
        .success,
    ).toBe(false);
  });
});
