import { z } from "zod";

import { parseMoney, PAYMENT_TYPES } from "@/domain/money";
import type { PieceStatus } from "@/domain/piece-state-machine";

/**
 * Registro de restauraciones y piezas (Pasos 7.3 y 7.4). Campos de la pieza según
 * P22: medida libre; material y servicio del catálogo o escritos libremente; peso
 * en gramos opcional; precio obligatorio; taller opcional al registrar.
 * Lo obligatorio se define aquí (no en la BD) para cambiarlo sin migraciones.
 */

export const MAX_PIECES = 100;

/**
 * Estados a los que puede pasar una pieza al crear la restauración desde una
 * cotización de WhatsApp (P49). Consulta lleva nota obligatoria y después sigue el
 * flujo normal (Espera respuesta cliente → Aprobada).
 */
export const COPY_INITIAL_STATUSES = [
  "en_consulta",
  "aprobada",
] as const satisfies readonly PieceStatus[];
export type CopyInitialStatus = (typeof COPY_INITIAL_STATUSES)[number];

/** Recorta y colapsa espacios repetidos. */
const line = (max: number) =>
  z
    .string()
    .transform((v) => v.trim().replace(/\s+/g, " "))
    .pipe(z.string().max(max, `Máximo ${max} caracteres`));

/** Texto largo: conserva los saltos de línea. */
const notes = (max: number) =>
  z.string().trim().max(max, `Máximo ${max} caracteres`);

/** Id opcional: los selectores usan "" para "ninguno". */
const optionalId = z
  .string()
  .nullable()
  .transform((v) => v || null)
  .pipe(z.guid().nullable());

/** Material o servicio: elegido del catálogo (id y nombre) o escrito libremente (solo nombre). */
const catalogChoice = z
  .object({ id: optionalId, name: line(100) })
  .transform(({ id, name }, ctx) => {
    if (name) return { id, name };
    if (id) {
      ctx.addIssue({
        code: "custom",
        path: ["name"],
        message: "Escribe el nombre",
      });
      return z.NEVER;
    }
    return null;
  });

const price = z
  .string()
  .trim()
  .min(1, "Ingresa el precio")
  .transform((value, ctx) => {
    const cents = parseMoney(value);
    if (cents === null) {
      ctx.addIssue({
        code: "custom",
        message: "Ingresa un monto válido (hasta 2 decimales)",
      });
      return z.NEVER;
    }
    return cents;
  });

/** Peso en gramos (opcional, hasta 2 decimales). */
const weight = z
  .string()
  .trim()
  .refine(
    (v) => v === "" || /^\d{1,6}([.,]\d{1,2})?$/.test(v),
    "Ingresa el peso en gramos (hasta 2 decimales)",
  )
  .transform((v) => (v === "" ? null : Number(v.replace(",", "."))))
  .refine((v) => v === null || v > 0, "El peso debe ser mayor que 0");

export const pieceSchema = z
  .object({
    workshopId: optionalId,
    description: line(300).pipe(
      z.string().min(1, "Describe la pieza (qué es y cómo está)"),
    ),
    measure: line(100),
    material: catalogChoice,
    service: catalogChoice,
    weight,
    price,
    /** Marca "Urgente" (P47): no es un estado. */
    urgent: z.boolean().default(false),
    /** Pieza de la cotización de WhatsApp que se está pidiendo (P46). */
    quoteItemId: optionalId.optional(),
    notes: notes(1000),
    /** Solo en "Crear restauración" desde una cotización (P49). */
    initialStatus: z.enum(COPY_INITIAL_STATUSES).optional(),
    statusNote: notes(1000).optional(),
  })
  .transform(({ price: priceCents, weight: weightGrams, ...rest }) => ({
    ...rest,
    weightGrams,
    priceCents,
  }));

export type PieceFormInput = z.input<typeof pieceSchema>;
export type PieceInput = z.output<typeof pieceSchema>;

const PERCENT_ERROR = "El adelanto debe estar entre 1 y 100 %";

const depositPercent = z.coerce
  .number<string | number>({ error: PERCENT_ERROR })
  .min(1, PERCENT_ERROR)
  .max(100, PERCENT_ERROR)
  .refine(
    (v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-9,
    "Máximo dos decimales",
  );

const restorationFields = {
  clientId: z.guid({ error: "Elige un cliente" }),
  contactId: optionalId,
  notes: notes(2000),
  pieces: z
    .array(pieceSchema)
    .min(1, "Agrega al menos una pieza")
    .max(MAX_PIECES, `Máximo ${MAX_PIECES} piezas por restauración`),
};

/**
 * El % de adelanto solo se valida y se guarda si el pago es "A cuenta"; en los
 * demás tipos el campo se oculta y queda en null.
 */
export const restorationSchema = z.discriminatedUnion("paymentType", [
  z.object({
    ...restorationFields,
    paymentType: z.literal("a_cuenta"),
    depositPercent,
  }),
  z.object({
    ...restorationFields,
    paymentType: z.enum(PAYMENT_TYPES).exclude(["a_cuenta"]),
    depositPercent: z.unknown().transform(() => null),
  }),
]);

export type RestorationFormInput = z.input<typeof restorationSchema>;
export type RestorationInput = z.output<typeof restorationSchema>;

/** Pieza de la copia: el estado inicial es obligatorio y Consulta pide nota (P49). */
const copyPieceSchema = pieceSchema.superRefine((piece, ctx) => {
  if (!piece.initialStatus) {
    ctx.addIssue({
      code: "custom",
      path: ["initialStatus"],
      message: "Elige el estado inicial",
    });
  } else if (piece.initialStatus === "en_consulta" && !piece.statusNote) {
    ctx.addIssue({
      code: "custom",
      path: ["statusNote"],
      message: "Escribe una nota para la consulta",
    });
  }
});

const copyFields = {
  ...restorationFields,
  pieces: z
    .array(copyPieceSchema)
    .min(1, "Agrega al menos una pieza")
    .max(MAX_PIECES, `Máximo ${MAX_PIECES} piezas por restauración`),
};

/**
 * "Crear restauración" desde una cotización de WhatsApp (P46 y P49): como el
 * registro, más el estado inicial de cada pieza.
 */
export const copyRestorationSchema = z.discriminatedUnion("paymentType", [
  z.object({
    ...copyFields,
    paymentType: z.literal("a_cuenta"),
    depositPercent,
  }),
  z.object({
    ...copyFields,
    paymentType: z.enum(PAYMENT_TYPES).exclude(["a_cuenta"]),
    depositPercent: z.unknown().transform(() => null),
  }),
]);

const editFields = {
  contactId: restorationFields.contactId,
  notes: restorationFields.notes,
};

/** Datos editables de una restauración ya registrada (el cliente no cambia, P12). */
export const restorationEditSchema = z.discriminatedUnion("paymentType", [
  z.object({
    ...editFields,
    paymentType: z.literal("a_cuenta"),
    depositPercent,
  }),
  z.object({
    ...editFields,
    paymentType: z.enum(PAYMENT_TYPES).exclude(["a_cuenta"]),
    depositPercent: z.unknown().transform(() => null),
  }),
]);

export type RestorationEditFormInput = z.input<typeof restorationEditSchema>;

/** Teléfono anotado en una cotización sin cliente: dígitos, espacios, + y guiones. */
const optionalPhone = line(30).refine(
  (v) => v === "" || /^\+?[\d\s()-]{6,}$/.test(v),
  "Ingresa un teléfono válido",
);

const quoteFields = {
  /** Opcional: sin cliente se anotan nombre y teléfono (P46). */
  clientId: optionalId,
  contactId: optionalId,
  customerName: line(200),
  customerPhone: optionalPhone,
  notes: notes(2000),
  pieces: restorationFields.pieces,
};

/** Cotización de restauración por WhatsApp (P46): como el registro, pero el cliente es opcional. */
export const whatsappQuoteSchema = z.discriminatedUnion("paymentType", [
  z.object({
    ...quoteFields,
    paymentType: z.literal("a_cuenta"),
    depositPercent,
  }),
  z.object({
    ...quoteFields,
    paymentType: z.enum(PAYMENT_TYPES).exclude(["a_cuenta"]),
    depositPercent: z.unknown().transform(() => null),
  }),
]);

export type WhatsappQuoteFormInput = z.input<typeof whatsappQuoteSchema>;
export type WhatsappQuoteInput = z.output<typeof whatsappQuoteSchema>;
