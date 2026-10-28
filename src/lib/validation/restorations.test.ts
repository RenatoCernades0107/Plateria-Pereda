import { describe, expect, it } from "vitest";

import {
  copyRestorationSchema,
  DEPOSIT_BRANCH_ERROR,
  DEPOSIT_METHOD_ERROR,
  invalidInputMessage,
  MAX_PIECES,
  pieceKeepingUrgencySchema,
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
const POLISH = "3d4e5f6a-7b8c-4d9e-8f10-2b3c4d5e6f70";
const YAPE = "2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f";
const CAJA = "3d4e5f6a-7b8c-4d9e-8f0a-1b2c3d4e5f6a";

const piece: PieceFormInput = {
  workshopId: "",
  description: "  Bandeja   ovalada con asas ",
  measure: "40 × 30 cm",
  materials: [SILVER],
  services: [POLISH],
  weight: "850,5",
  price: "1,250.50",
  notes: "",
};

const restoration = {
  clientId: CLIENT,
  contactId: "",
  paymentType: "a_cuenta" as const,
  depositAmount: "500",
  depositMethodId: YAPE,
  depositBranchId: CAJA,
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
      quantity: 1,
      description: "Bandeja ovalada con asas",
      measure: "40 × 30 cm",
      materials: [SILVER],
      services: [POLISH],
      weightGrams: 850.5,
      priceCents: 125_050,
      urgent: false,
      estimatedDeliveryDate: null,
      workshopDeliveryDate: null,
      notes: "",
    });
  });

  it("una pieza urgente exige la fecha estimada de entrega", () => {
    expect(errorsOf(pieceSchema, { ...piece, urgent: true })).toEqual({
      estimatedDeliveryDate: "Indica la fecha estimada de entrega",
    });
    expect(
      errorsOf(pieceSchema, {
        ...piece,
        urgent: true,
        estimatedDeliveryDate: "   ",
      }),
    ).toEqual({ estimatedDeliveryDate: "Indica la fecha estimada de entrega" });
    expect(
      pieceSchema.parse({
        ...piece,
        urgent: true,
        estimatedDeliveryDate: " 2026-11-05 ",
      }),
    ).toMatchObject({ urgent: true, estimatedDeliveryDate: "2026-11-05" });
  });

  it("la fecha de entrega tiene que existir en el calendario", () => {
    for (const estimatedDeliveryDate of [
      "2026-02-30",
      "05/11/2026",
      "mañana",
    ]) {
      expect(
        errorsOf(pieceSchema, {
          ...piece,
          urgent: true,
          estimatedDeliveryDate,
        }),
      ).toEqual({ estimatedDeliveryDate: "Ingresa una fecha válida" });
    }
  });

  it("la fecha del taller es opcional y no es posterior a la del cliente", () => {
    const urgent = {
      ...piece,
      urgent: true,
      estimatedDeliveryDate: "2026-11-05",
    };
    expect(pieceSchema.parse(urgent).workshopDeliveryDate).toBeNull();
    expect(
      pieceSchema.parse({ ...urgent, workshopDeliveryDate: "2026-11-05" })
        .workshopDeliveryDate,
    ).toBe("2026-11-05");
    expect(
      errorsOf(pieceSchema, { ...urgent, workshopDeliveryDate: "2026-11-06" }),
    ).toEqual({
      workshopDeliveryDate:
        "La fecha del taller no puede ser posterior a la del cliente",
    });
    expect(
      errorsOf(pieceSchema, { ...urgent, workshopDeliveryDate: "2026-02-30" }),
    ).toEqual({ workshopDeliveryDate: "Ingresa una fecha válida" });
  });

  it("una pieza que no es urgente no guarda fecha de entrega", () => {
    expect(
      pieceSchema.parse({
        ...piece,
        estimatedDeliveryDate: "2026-11-05",
        workshopDeliveryDate: "2026-11-03",
      }),
    ).toMatchObject({
      estimatedDeliveryDate: null,
      workshopDeliveryDate: null,
    });
  });

  it("al editar una pieza con la urgencia fija, la fecha no se exige", () => {
    expect(
      pieceKeepingUrgencySchema.parse({ ...piece, urgent: true }),
    ).toMatchObject({ urgent: true, estimatedDeliveryDate: null });
  });

  it("cantidad: entero de 1 a 999; vacía = 1", () => {
    expect(pieceSchema.parse({ ...piece, quantity: " 6 " }).quantity).toBe(6);
    expect(pieceSchema.parse({ ...piece, quantity: "" }).quantity).toBe(1);
    expect(pieceSchema.parse({ ...piece, quantity: 999 }).quantity).toBe(999);
    for (const quantity of ["0", "1000", "2.5", "-1", "dos"]) {
      expect(errorsOf(pieceSchema, { ...piece, quantity })).toEqual({
        quantity: "La cantidad debe ser un número entero entre 1 y 999",
      });
    }
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
        services: [POLISH],
        weight: "",
        price: "0",
        notes: "",
      }),
    ).toEqual({
      workshopId: null,
      quantity: 1,
      description: "Cáliz",
      measure: "",
      materials: [],
      services: [POLISH],
      weightGrams: null,
      priceCents: 0,
      urgent: false,
      estimatedDeliveryDate: null,
      workshopDeliveryDate: null,
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

  it("en la cotización de WhatsApp el precio es opcional (vacío = por definir)", () => {
    expect(
      quotePieceSchema.parse({ ...piece, price: " " }).priceCents,
    ).toBeNull();
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

  it("al menos un servicio del catálogo; varios, sin repetir y en orden (D59)", () => {
    for (const schema of [pieceSchema, quotePieceSchema]) {
      expect(errorsOf(schema, { ...piece, services: [] })).toEqual({
        services: "Elige el servicio",
      });
      expect(errorsOf(schema, { ...piece, services: undefined })).toEqual({
        services: "Elige el servicio",
      });
      expect(
        errorsOf(schema, { ...piece, services: ["Pulido"] }),
      ).toHaveProperty("services.0");
    }
    expect(
      pieceSchema.parse({ ...piece, services: [SILVER, POLISH, SILVER] })
        .services,
    ).toEqual([SILVER, POLISH]);
  });

  it("máximo 10 servicios por pieza", () => {
    const many = Array.from(
      { length: 11 },
      (_, i) => `3d4e5f6a-7b8c-4d9e-8f10-${String(i).padStart(12, "0")}`,
    );
    expect(errorsOf(pieceSchema, { ...piece, services: many })).toEqual({
      services: "Máximo 10 servicios",
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
        notes: "a".repeat(1001),
      }),
    ).toEqual({
      description: "Máximo 300 caracteres",
      measure: "Máximo 100 caracteres",
      notes: "Máximo 1000 caracteres",
    });
  });

  it("los materiales son ids del catálogo, sin repetir y hasta 10", () => {
    expect(
      pieceSchema.parse({ ...piece, materials: [SILVER, SILVER] }).materials,
    ).toEqual([SILVER]);
    expect(
      errorsOf(pieceSchema, { ...piece, materials: ["plata"] }),
    ).toMatchObject({ "materials.0": expect.any(String) });
    expect(
      errorsOf(pieceSchema, {
        ...piece,
        materials: Array.from(
          { length: 11 },
          (_, i) =>
            `1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d${String(i).padStart(2, "0")}`,
        ),
      }),
    ).toEqual({ materials: "Máximo 10 materiales" });
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
      notes: "",
    });
    expect(result.pieces).toHaveLength(1);
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

  it("rechaza un adelanto mayor que el total", () => {
    expect(
      errorsOf(restorationSchema, { ...restoration, depositAmount: "1250.51" }),
    ).toEqual({
      depositAmount:
        "El adelanto no puede ser mayor que el total (S/ 1,250.50)",
    });
    // El total es la suma de los precios: el adelanto puede ser igual al total.
    expect(
      restorationSchema.parse({ ...restoration, depositAmount: "1250.50" })
        .depositAmount,
    ).toBe(125050);
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

  it("con adelanto exige el método con que se pagó (se registra como pago)", () => {
    expect(restorationSchema.parse(restoration).depositMethodId).toBe(YAPE);
    for (const depositMethodId of ["", null, undefined])
      expect(
        errorsOf(restorationSchema, { ...restoration, depositMethodId }),
      ).toEqual({ depositMethodId: DEPOSIT_METHOD_ERROR });
    expect(
      errorsOf(restorationSchema, { ...restoration, depositMethodId: "x" }),
    ).toHaveProperty("depositMethodId");
    // Se muestra junto con los demás errores del formulario.
    expect(
      errorsOf(restorationSchema, {
        ...restoration,
        clientId: "",
        depositMethodId: "",
      }),
    ).toEqual({
      clientId: "Elige un cliente",
      depositMethodId: DEPOSIT_METHOD_ERROR,
    });
    expect(
      invalidInputMessage(
        restorationSchema.safeParse({ ...restoration, depositMethodId: "" })
          .error!,
      ),
    ).toBe(`${DEPOSIT_METHOD_ERROR}.`);
  });

  it("con adelanto exige la sucursal que lo cobró (va al pedido de Shopify)", () => {
    expect(restorationSchema.parse(restoration).depositBranchId).toBe(CAJA);
    for (const depositBranchId of ["", null, undefined])
      expect(
        errorsOf(restorationSchema, { ...restoration, depositBranchId }),
      ).toEqual({ depositBranchId: DEPOSIT_BRANCH_ERROR });
    expect(
      invalidInputMessage(
        restorationSchema.safeParse({ ...restoration, depositBranchId: "" })
          .error!,
      ),
    ).toBe(`${DEPOSIT_BRANCH_ERROR}.`);
    // Sin adelanto no se pide; en otros tipos se descarta.
    expect(
      restorationSchema.parse({
        ...restoration,
        depositAmount: "",
        depositBranchId: "",
      }).depositBranchId,
    ).toBeNull();
    expect(
      restorationSchema.parse({ ...restoration, paymentType: "contado" })
        .depositBranchId,
    ).toBeNull();
  });

  it("sin adelanto (vacío o 0) no pide método; en otros tipos se descarta", () => {
    for (const depositAmount of ["", "0"])
      expect(
        restorationSchema.parse({
          ...restoration,
          depositAmount,
          depositMethodId: "",
        }).depositMethodId,
      ).toBeNull();
    // Sin la clave (como envían otros llamadores).
    const withoutMethod: Partial<typeof restoration> = { ...restoration };
    delete withoutMethod.depositMethodId;
    expect(
      restorationSchema.parse({
        ...withoutMethod,
        paymentType: "contado",
        depositAmount: "",
      }).depositMethodId,
    ).toBeNull();
    expect(
      restorationSchema.parse({ ...restoration, paymentType: "credito" })
        .depositMethodId,
    ).toBeNull();
  });

  it("tipo de guía: normal por defecto; interno u observado", () => {
    expect(restorationSchema.parse(restoration).kind).toBe("normal");
    expect(
      restorationSchema.parse({
        ...restoration,
        kind: "interno",
        paymentType: "sin_definir",
      }).kind,
    ).toBe("interno");
    expect(
      errorsOf(restorationSchema, { ...restoration, kind: "otro" }),
    ).toHaveProperty("kind");
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
    notes: "",
    pieces: [piece],
  };

  it("el cliente, el nombre y el teléfono son opcionales", () => {
    expect(whatsappQuoteSchema.parse(quote)).toMatchObject({
      clientId: null,
      customerName: "Ana Pérez",
      customerPhone: "",
      depositPercent: null,
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

  it("acepta piezas sin precio cotizado", () => {
    const parsed = whatsappQuoteSchema.parse({
      ...quote,
      pieces: [{ ...piece, price: "" }],
    });
    expect(parsed.pieces[0]!.priceCents).toBeNull();
  });
});

describe("copyRestorationSchema (P49)", () => {
  const copy = (extra: Partial<PieceFormInput>) => ({
    ...restoration,
    pieces: [{ ...piece, ...extra }],
  });

  it("sin precio no pide estado ni nota: pasa a Consulta sola", () => {
    expect(
      copyRestorationSchema.safeParse(
        copy({ price: "", initialStatus: undefined }),
      ).success,
    ).toBe(true);
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

  it("con adelanto también exige su método y su sucursal", () => {
    expect(
      errorsOf(copyRestorationSchema, {
        ...copy({ initialStatus: "aprobada" }),
        depositMethodId: "",
      }),
    ).toEqual({ depositMethodId: DEPOSIT_METHOD_ERROR });
    expect(
      errorsOf(copyRestorationSchema, {
        ...copy({ initialStatus: "aprobada" }),
        depositBranchId: "",
      }),
    ).toEqual({ depositBranchId: DEPOSIT_BRANCH_ERROR });
  });

  it("el registro en oficina no pide estado inicial", () => {
    expect(restorationSchema.safeParse(restoration).success).toBe(true);
  });
});
