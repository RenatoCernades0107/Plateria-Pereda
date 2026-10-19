import { z } from "zod";

import {
  DEPOSIT_NEGATIVE_ERROR,
  depositAmountError,
  MAX_CENTS,
  parseMoney,
  PAYMENT_TYPES,
  sumCents,
} from "@/domain/money";
import type { PieceStatus } from "@/domain/piece-state-machine";
import { RESTORATION_KINDS } from "@/domain/restoration-status";

/**
 * Registro de restauraciones y piezas (Pasos 7.3 y 7.4). Campos de la pieza según
 * P22 y D59: los servicios (uno o más, del catálogo) y la descripción son obligatorios;
 * los materiales (uno o más, del catálogo), peso en gramos, medida y precio son opcionales; taller
 * opcional al registrar. El precio de venta vacío queda "Por definir" (lo asigna el
 * admin, D58); en las cotizaciones de WhatsApp también es opcional ("Por definir").
 * Al registrar la restauración (directa o desde una cotización) la pieza sin precio
 * pasa a Consulta (la BD lo asegura).
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

/** Materiales de la pieza: ids del catálogo, en el orden elegido y sin repetir. */
export const MAX_MATERIALS = 10;
const materialIds = z
  .array(z.guid())
  .max(MAX_MATERIALS, `Máximo ${MAX_MATERIALS} materiales`)
  .default([])
  .transform((ids) => [...new Set(ids)]);

/**
 * Servicios de la pieza (D59): al menos uno, ids del catálogo, en el orden elegido y
 * sin repetir.
 */
export const MAX_SERVICES = 10;
const requiredServices = z
  .array(z.guid())
  .max(MAX_SERVICES, `Máximo ${MAX_SERVICES} servicios`)
  .default([])
  .transform((ids) => [...new Set(ids)])
  .refine((ids) => ids.length > 0, "Elige el servicio");

/** Monto en céntimos; vacío = null. */
const money = z
  .string()
  .trim()
  .transform((value, ctx) => {
    if (value === "") return null;
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

/** Precio de venta de la pieza (D58): vacío = sin asignar (null). */
const optionalPrice = money;

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

/**
 * Cantidad de unidades de la pieza (p. ej. "6 cucharitas"): entero de 1 a 999,
 * vacío = 1. Es informativa: el precio y el costo son de la pieza completa.
 */
export const MAX_QUANTITY = 999;
const QUANTITY_ERROR = `La cantidad debe ser un número entero entre 1 y ${MAX_QUANTITY}`;
export const quantity = z
  .union([z.string(), z.number()])
  .optional()
  .transform((v, ctx) => {
    const text = v == null ? "" : String(v).trim();
    if (text === "") return 1;
    const n = Number(text);
    if (!/^\d+$/.test(text) || n < 1 || n > MAX_QUANTITY) {
      ctx.addIssue({ code: "custom", message: QUANTITY_ERROR });
      return z.NEVER;
    }
    return n;
  });

const pieceFields = {
  workshopId: optionalId,
  quantity,
  description: line(300).pipe(
    z.string().min(1, "Describe la pieza (qué es y cómo está)"),
  ),
  measure: line(100),
  materials: materialIds,
  services: requiredServices,
  weight,
  /** Marca "Urgente" (P47): no es un estado. */
  urgent: z.boolean().default(false),
  /** Pieza de la cotización de WhatsApp que se está pidiendo (P46). */
  quoteItemId: optionalId.optional(),
  notes: notes(1000),
  /** Solo en "Crear restauración" desde una cotización (P49). */
  initialStatus: z.enum(COPY_INITIAL_STATUSES).optional(),
  statusNote: notes(1000).optional(),
};

/** Pieza de una restauración: el precio de venta puede quedar sin asignar (D58). */
export const pieceSchema = z
  .object({ ...pieceFields, price: optionalPrice })
  .transform(({ price: priceCents, weight: weightGrams, ...rest }) => ({
    ...rest,
    weightGrams,
    priceCents,
  }));

/** Pieza de una cotización de WhatsApp: el precio cotizado también es opcional. */
export const quotePieceSchema = pieceSchema;

export type PieceFormInput = z.input<typeof pieceSchema>;
export type PieceInput = z.output<typeof pieceSchema>;

const PERCENT_ERROR = "El adelanto debe estar entre 1 y 100 %";

const depositPercentValue = z.coerce
  .number<string | number>({ error: PERCENT_ERROR })
  .min(1, PERCENT_ERROR)
  .max(100, PERCENT_ERROR)
  .refine(
    (v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-9,
    "Máximo dos decimales",
  );

/** El adelanto es opcional: vacío (o sin definir) = sin adelanto, se guarda null. */
const depositPercent = z.preprocess(
  (v) => (v == null || (typeof v === "string" && v.trim() === "") ? null : v),
  depositPercentValue.nullable(),
);

/**
 * Adelanto "A cuenta" en soles (opcional): vacío = sin adelanto (null). Se guarda en
 * céntimos; el % se calcula cuando las piezas tienen precio.
 */
export const depositAmount = z.preprocess(
  (v) => (v == null ? "" : typeof v === "number" ? String(v) : v),
  z
    .string()
    .trim()
    .transform((value, ctx): number | null => {
      if (value === "") return null;
      if (/^-/.test(value.replace(/^S\/\s*/i, ""))) {
        ctx.addIssue({ code: "custom", message: DEPOSIT_NEGATIVE_ERROR });
        return z.NEVER;
      }
      const cents = parseMoney(value);
      if (cents === null || cents > MAX_CENTS) {
        ctx.addIssue({
          code: "custom",
          message: "Ingresa el adelanto en soles (hasta 2 decimales)",
        });
        return z.NEVER;
      }
      return cents;
    }),
);

/**
 * Mensaje para el usuario cuando falla la validación en el servidor: el del adelanto
 * si es ese el problema (negativo, mal escrito, mayor que el total o sin método); si
 * no, genérico.
 */
export function invalidInputMessage(error: z.ZodError): string {
  const deposit = error.issues.find(
    (i) => i.path[0] === "depositAmount" || i.path[0] === "depositMethodId",
  );
  return deposit ? `${deposit.message}.` : "Revisa los datos ingresados.";
}

/**
 * El adelanto no puede superar el total de las piezas con precio. Corre
 * aunque otros campos tengan errores (`when`), así el aviso aparece de inmediato; por
 * eso lee los valores con cuidado (una pieza inválida cuenta 0).
 */
function checkDepositAgainstPieces(
  v: {
    depositAmount: unknown;
    pieces: unknown;
  },
  ctx: z.RefinementCtx,
) {
  if (typeof v.depositAmount !== "number") return;
  const pieces = Array.isArray(v.pieces) ? v.pieces : [];
  const total = sumCents(
    pieces.map((p: { priceCents?: unknown } | null) =>
      typeof p?.priceCents === "number" ? p.priceCents : 0,
    ),
  );
  const message = depositAmountError(v.depositAmount, total);
  if (message)
    ctx.addIssue({ code: "custom", path: ["depositAmount"], message });
}

/** Opciones del chequeo: corre mientras el adelanto en sí sea válido. */
const depositCheckParams = {
  when: (payload: { issues: readonly { path?: PropertyKey[] }[] }) =>
    !payload.issues.some((i) => i.path?.[0] === "depositAmount"),
};

/**
 * Método con que se pagó el adelanto al registrar la restauración "A cuenta": el
 * adelanto se guarda como un pago real (el mismo registro que "Registrar pago"). Solo
 * se pide si hay adelanto (> 0); en los demás tipos queda en null.
 */
const depositMethodId = optionalId.optional().transform((v) => v ?? null);
const noDepositMethod = z
  .unknown()
  .optional()
  .transform(() => null);

export const DEPOSIT_METHOD_ERROR =
  "Elige el método con que se pagó el adelanto";

function requireDepositMethod(
  v: { depositAmount: unknown; depositMethodId: unknown },
  ctx: z.RefinementCtx,
) {
  if (
    typeof v.depositAmount === "number" &&
    v.depositAmount > 0 &&
    !v.depositMethodId
  )
    ctx.addIssue({
      code: "custom",
      path: ["depositMethodId"],
      message: DEPOSIT_METHOD_ERROR,
    });
}

/** Corre aunque otros campos tengan errores, salvo el propio método mal escrito. */
const depositMethodParams = {
  when: (payload: { issues: readonly { path?: PropertyKey[] }[] }) =>
    !payload.issues.some((i) => i.path?.[0] === "depositMethodId"),
};

const restorationFields = {
  clientId: z.guid({ error: "Elige un cliente" }),
  /** Tipo de guía: interna u observada no se cobran (la BD ignora el pago). */
  kind: z.enum(RESTORATION_KINDS).default("normal"),
  contactId: optionalId,
  notes: notes(2000),
  pieces: z
    .array(pieceSchema)
    .min(1, "Agrega al menos una pieza")
    .max(MAX_PIECES, `Máximo ${MAX_PIECES} piezas por restauración`),
};

/**
 * El adelanto en soles (opcional) solo se valida y se guarda si el pago es "A cuenta";
 * no puede ser negativo ni mayor que el total de las piezas con precio. En los demás
 * tipos el campo se oculta y queda en null.
 */
export const restorationSchema = z.discriminatedUnion("paymentType", [
  z
    .object({
      ...restorationFields,
      paymentType: z.literal("a_cuenta"),
      depositAmount,
      depositMethodId,
    })
    .superRefine(checkDepositAgainstPieces, depositCheckParams)
    .superRefine(requireDepositMethod, depositMethodParams),
  z.object({
    ...restorationFields,
    paymentType: z.enum(PAYMENT_TYPES).exclude(["a_cuenta"]),
    depositAmount: z.unknown().transform(() => null),
    depositMethodId: noDepositMethod,
  }),
]);

export type RestorationFormInput = z.input<typeof restorationSchema>;
export type RestorationInput = z.output<typeof restorationSchema>;

/**
 * Pieza de la copia: el estado inicial es obligatorio y Consulta pide nota (P49).
 * Sin precio la pieza pasa a Consulta sola, con su nota (la BD lo asegura).
 */
const copyPieceSchema = pieceSchema.superRefine((piece, ctx) => {
  if (piece.priceCents === null) return;
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
  z
    .object({
      ...copyFields,
      paymentType: z.literal("a_cuenta"),
      depositAmount,
      depositMethodId,
    })
    .superRefine(checkDepositAgainstPieces, depositCheckParams)
    .superRefine(requireDepositMethod, depositMethodParams),
  z.object({
    ...copyFields,
    paymentType: z.enum(PAYMENT_TYPES).exclude(["a_cuenta"]),
    depositAmount: z.unknown().transform(() => null),
    depositMethodId: noDepositMethod,
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
    depositAmount,
  }),
  z.object({
    ...editFields,
    paymentType: z.enum(PAYMENT_TYPES).exclude(["a_cuenta"]),
    depositAmount: z.unknown().transform(() => null),
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
  pieces: z
    .array(quotePieceSchema)
    .min(1, "Agrega al menos una pieza")
    .max(MAX_PIECES, `Máximo ${MAX_PIECES} piezas por restauración`),
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
