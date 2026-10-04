import { z } from "zod";

import {
  isValidDocument,
  normalizeDocument,
  PERSON_DOCUMENT_TYPES,
} from "@/domain/documents";
import { normalizePhone } from "@/domain/phone";

/**
 * Datos obligatorios según la propuesta de P27 (pendiente de confirmar): se definen
 * aquí y no en la base de datos, para poder cambiarlos sin migraciones.
 */

/** Recorta y colapsa espacios repetidos. */
const cleanText = (max: number) =>
  z
    .string()
    .transform((v) => v.trim().replace(/\s+/g, " "))
    .pipe(z.string().max(max, `Máximo ${max} caracteres`));

const requiredName = (message: string) =>
  cleanText(100).pipe(z.string().min(1, message));

const phone = z
  .string()
  .trim()
  .min(1, "Ingresa un teléfono")
  .transform((value, ctx) => {
    const normalized = normalizePhone(value);
    if (!normalized) {
      ctx.addIssue({
        code: "custom",
        message:
          "Ingresa un teléfono válido (celular de 9 dígitos o fijo con código)",
      });
      return z.NEVER;
    }
    return normalized;
  });

const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .refine(
    (v) => v === "" || z.email().safeParse(v).success,
    "Ingresa un email válido",
  )
  .transform((v) => v || null);

const optionalText = (max: number) => cleanText(max);

/** Tipo y número de documento de una persona: ambos o ninguno. */
const personDocument = z
  .object({
    documentType: z.enum(PERSON_DOCUMENT_TYPES).nullable(),
    documentNumber: z.string(),
  })
  .transform((v, ctx) => {
    const raw = v.documentNumber.trim();
    if (!v.documentType && !raw)
      return { documentType: null, documentNumber: null };
    if (!v.documentType) {
      ctx.addIssue({
        code: "custom",
        path: ["documentType"],
        message: "Elige el tipo de documento",
      });
      return z.NEVER;
    }
    const number = normalizeDocument(v.documentType, raw);
    if (!number) {
      ctx.addIssue({
        code: "custom",
        path: ["documentNumber"],
        message: "Ingresa el número de documento",
      });
      return z.NEVER;
    }
    if (!isValidDocument(v.documentType, number)) {
      ctx.addIssue({
        code: "custom",
        path: ["documentNumber"],
        message:
          v.documentType === "dni"
            ? "El DNI tiene 8 dígitos"
            : v.documentType === "ce"
              ? "El carné de extranjería tiene de 9 a 12 dígitos"
              : "El pasaporte tiene de 6 a 12 letras o números",
      });
      return z.NEVER;
    }
    return { documentType: v.documentType, documentNumber: number };
  });

const ruc = z
  .string()
  .transform((v) => normalizeDocument("ruc", v))
  .refine((v) => v.length > 0, "Ingresa el RUC")
  .refine(
    (v) => v === "" || isValidDocument("ruc", v),
    "Ingresa un RUC válido",
  );

const common = {
  phone,
  email: optionalEmail,
  address: optionalText(300),
  notes: optionalText(2000),
};

export const personSchema = z
  .object({
    kind: z.literal("persona"),
    firstName: requiredName("Ingresa los nombres"),
    lastName: requiredName("Ingresa los apellidos"),
    document: personDocument,
    ...common,
  })
  .transform(({ document, ...rest }) => ({ ...rest, ...document }));

export const companySchema = z
  .object({
    kind: z.literal("empresa"),
    legalName: cleanText(200).pipe(
      z.string().min(1, "Ingresa la razón social"),
    ),
    ruc,
    ...common,
  })
  .transform(({ ruc: documentNumber, ...rest }) => ({
    ...rest,
    documentType: "ruc" as const,
    documentNumber,
  }));

export const clientSchema = z.discriminatedUnion("kind", [
  personSchema,
  companySchema,
]);

export type PersonFormInput = z.input<typeof personSchema>;
export type CompanyFormInput = z.input<typeof companySchema>;
export type ClientFormInput = z.input<typeof clientSchema>;
export type ClientInput = z.output<typeof clientSchema>;

export const contactSchema = z
  .object({
    firstName: requiredName("Ingresa el nombre"),
    lastName: optionalText(100),
    position: optionalText(100),
    document: personDocument,
    phone,
    email: optionalEmail,
  })
  .transform(({ document, ...rest }) => ({ ...rest, ...document }));

export type ContactFormInput = z.input<typeof contactSchema>;
export type ContactInput = z.output<typeof contactSchema>;
