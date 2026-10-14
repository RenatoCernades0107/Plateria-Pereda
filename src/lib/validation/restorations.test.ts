import { describe, expect, it } from "vitest";

import {
  copyRestorationSchema,
  invalidInputMessage,
  MAX_PIECES,
  pieceSchema,
  quotePieceSchema,
  restorationSchema,
  whatsappQuoteSchema,
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
  notes: "",
};

const restoration = {
  clientId: CLIENT,
  contactId: "",
  paymentType: "a_cuenta" as const,
  depositAmount: "500",
  pricesIncludeIgv: "si" as const,
  notes: "",
  pieces: [piece],
};

const errorsOf = (
  schema:
    | typeof pieceSchema
    | typeof quotePieceSchema
    | typeof restorationSchema
    | typeof whatsappQuoteSchema
    | typeof copyRestorationSchema,
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
      urgent: false,
      notes: "",
    });
  });

  it("el precio de venta puede quedar sin asignar (D58)", () => {
    expect(pieceSchema.parse({ ...piece, price: "  " })).toMatchObject({
      priceCents: null,
    });
  });

  it("acepta precio 0 y deja vacíos los opcionales: material, peso, medida y precio (P22, D59)", () => {
    expect(
      pieceSchema.parse({
        workshopId: null,
        description: "Cáliz",
        measure: "",
        material: { id: null, name: "" },
        service: { id: null, name: "Limpieza" },
        weight: "",
        price: "0",
        notes: "",
      }),
    ).toEqual({
      workshopId: null,
      description: "Cáliz",
      measure: "",
      material: null,
      service: { id: null, name: "Limpieza" },
      weightGrams: null,
      priceCents: 0,
      urgent: false,
      notes: "",
    });
  });

  it("guarda el taller elegido", () => {
    expect(pieceSchema.parse({ ...piece, workshopId: WORKSHOP })).toMatchObject(
      { workshopId: WORKSHOP },
    );
  });

  it("precio opcional, pero válido si se escribe", () => {
    for (const price of ["-10", "12.345", "abc", "100000000"]) {
      expect(errorsOf(pieceSchema, { ...piece, price })).toEqual({
        price: "Ingresa un monto válido (hasta 2 decimales)",
      });
    }
  });

  it("en la cotización de WhatsApp el precio es obligatorio", () => {
    expect(errorsOf(quotePieceSchema, { ...piece, price: " " })).toEqual({
      price: "Ingresa el precio",
    });
    expect(errorsOf(quotePieceSchema, { ...piece, price: "abc" })).toEqual({
      price: "Ingresa un monto válido (hasta 2 decimales)",
    });
    expect(quotePieceSchema.parse(piece).priceCents).toBe(125_050);
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

  it("servicio requerido, del catálogo o escrito (D59)", () => {
    for (const schema of [pieceSchema, quotePieceSchema]) {
      expect(
        errorsOf(schema, { ...piece, service: { id: null, name: "  " } }),
      ).toEqual({ "service.name": "Elige o escribe el servicio" });
      expect(
        errorsOf(schema, { ...piece, service: { id: SILVER, name: "" } }),
      ).toEqual({ "service.name": "Elige o escribe el servicio" });
    }
    expect(
      pieceSchema.parse({ ...piece, service: { id: SILVER, name: "Pulido" } })
        .service,
    ).toEqual({ id: SILVER, name: "Pulido" });
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
  it("a cuenta guarda el adelanto en soles (céntimos)", () => {
    const result = restorationSchema.parse(restoration);
    expect(result).toMatchObject({
      clientId: CLIENT,
      contactId: null,
      paymentType: "a_cuenta",
      depositAmount: 50000,
      pricesIncludeIgv: true,
      notes: "",
    });
    expect(result.pieces).toHaveLength(1);
  });

  it("exige responder si el precio incluye IGV (P13)", () => {
    expect(
      errorsOf(restorationSchema, { ...restoration, pricesIncludeIgv: "" }),
    ).toEqual({ pricesIncludeIgv: "Indica si el precio incluye IGV" });
    expect(
      restorationSchema.parse({ ...restoration, pricesIncludeIgv: "no" })
        .pricesIncludeIgv,
    ).toBe(false);
  });

  it("acepta el adelanto con hasta 2 decimales y con S/", () => {
    expect(
      restorationSchema.parse({ ...restoration, depositAmount: "S/ 333,33" })
        .depositAmount,
    ).toBe(33333);
    expect(
      errorsOf(restorationSchema, { ...restoration, depositAmount: "10.555" }),
    ).toEqual({
      depositAmount: "Ingresa el adelanto en soles (hasta 2 decimales)",
    });
  });

  it.each(["", "  "])(
    "acepta el adelanto vacío (%j) como sin adelanto",
    (depositAmount) => {
      expect(
        restorationSchema.parse({ ...restoration, depositAmount })
          .depositAmount,
      ).toBeNull();
    },
  );

  it.each(["-1", "S/ -20"])(
    "rechaza el adelanto negativo %j",
    (depositAmount) => {
      expect(
        errorsOf(restorationSchema, { ...restoration, depositAmount }),
      ).toEqual({ depositAmount: "El adelanto no puede ser negativo" });
    },
  );

  it("rechaza un adelanto mayor que el total (con IGV)", () => {
    expect(
      errorsOf(restorationSchema, { ...restoration, depositAmount: "1250.51" }),
    ).toEqual({
      depositAmount:
        "El adelanto no puede ser mayor que el total (S/ 1,250.50)",
    });
    // Sin IGV incluido el total es 1250.50 + 18 % = 1475.59.
    expect(
      restorationSchema.parse({
        ...restoration,
        pricesIncludeIgv: "no",
        depositAmount: "1475.59",
      }).depositAmount,
    ).toBe(147559);
  });

  it("sin precios asignados acepta cualquier adelanto en soles", () => {
    expect(
      restorationSchema.parse({
        ...restoration,
        depositAmount: "800",
        pieces: [{ ...piece, price: "" }],
      }).depositAmount,
    ).toBe(80000);
  });

  it.each(["contado", "credito"] as const)(
    "%s ignora el adelanto",
    (paymentType) => {
      expect(
        restorationSchema.parse({
          ...restoration,
          paymentType,
          depositAmount: "-5",
          contactId: CONTACT,
        }),
      ).toMatchObject({
        paymentType,
        depositAmount: null,
        contactId: CONTACT,
      });
    },
  );

  it("invalidInputMessage devuelve el error del adelanto", () => {
    const result = restorationSchema.safeParse({
      ...restoration,
      depositAmount: "5000",
    });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(invalidInputMessage(result.error)).toBe(
        "El adelanto no puede ser mayor que el total (S/ 1,250.50).",
      );
    const other = restorationSchema.safeParse({ ...restoration, clientId: "" });
    if (!other.success)
      expect(invalidInputMessage(other.error)).toBe(
        "Revisa los datos ingresados.",
      );
  });

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
        depositAmount: "-1",
        pieces: [piece, { ...piece, price: "", description: "" }],
      }),
    ).toEqual({
      depositAmount: "El adelanto no puede ser negativo",
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

describe("whatsappQuoteSchema (P46)", () => {
  const quote = {
    clientId: "",
    contactId: null,
    customerName: "  Ana   Pérez ",
    customerPhone: "",
    paymentType: "contado" as const,
    depositPercent: "",
    pricesIncludeIgv: "no" as const,
    notes: "",
    pieces: [piece],
  };

  it("el cliente, el nombre y el teléfono son opcionales", () => {
    expect(whatsappQuoteSchema.parse(quote)).toMatchObject({
      clientId: null,
      customerName: "Ana Pérez",
      customerPhone: "",
      depositPercent: null,
      pricesIncludeIgv: false,
    });
    expect(
      whatsappQuoteSchema.parse({ ...quote, customerName: "" }).customerName,
    ).toBe("");
  });

  it("acepta un cliente y valida el teléfono anotado", () => {
    expect(
      whatsappQuoteSchema.parse({ ...quote, clientId: CLIENT }).clientId,
    ).toBe(CLIENT);
    expect(
      errorsOf(whatsappQuoteSchema, { ...quote, customerPhone: "abc" }),
    ).toEqual({ customerPhone: "Ingresa un teléfono válido" });
    expect(
      whatsappQuoteSchema.parse({ ...quote, customerPhone: "+51 999 888 777" })
        .customerPhone,
    ).toBe("+51 999 888 777");
  });

  it("exige al menos una pieza", () => {
    expect(errorsOf(whatsappQuoteSchema, { ...quote, pieces: [] })).toEqual({
      pieces: "Agrega al menos una pieza",
    });
  });

  it("exige el precio cotizado de cada pieza", () => {
    expect(
      errorsOf(whatsappQuoteSchema, {
        ...quote,
        pieces: [{ ...piece, price: "" }],
      }),
    ).toEqual({ "pieces.0.price": "Ingresa el precio" });
  });
});

describe("copyRestorationSchema (P49)", () => {
  const copy = (extra: Partial<PieceFormInput>) => ({
    ...restoration,
    pieces: [{ ...piece, ...extra }],
  });

  it("exige el estado inicial de cada pieza", () => {
    expect(errorsOf(copyRestorationSchema, copy({}))).toEqual({
      "pieces.0.initialStatus": "Elige el estado inicial",
    });
  });

  it("Consulta exige nota; Aprobada no", () => {
    expect(
      errorsOf(
        copyRestorationSchema,
        copy({ initialStatus: "en_consulta", statusNote: "   " }),
      ),
    ).toEqual({ "pieces.0.statusNote": "Escribe una nota para la consulta" });
    expect(
      copyRestorationSchema.parse(
        copy({ initialStatus: "en_consulta", statusNote: " Consultar " }),
      ).pieces[0],
    ).toMatchObject({ initialStatus: "en_consulta", statusNote: "Consultar" });
    expect(
      copyRestorationSchema.parse(copy({ initialStatus: "aprobada" })).pieces[0]
        ?.initialStatus,
    ).toBe("aprobada");
  });

  it("no acepta otros estados (ni saltar a Espera respuesta cliente)", () => {
    for (const initialStatus of ["registrada", "en_espera"]) {
      expect(
        copyRestorationSchema.safeParse(
          copy({ initialStatus: initialStatus as never, statusNote: "x" }),
        ).success,
      ).toBe(false);
    }
  });

  it("el registro en oficina no pide estado inicial", () => {
    expect(restorationSchema.safeParse(restoration).success).toBe(true);
  });
});
