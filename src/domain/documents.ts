import { isValidRuc } from "./ruc";

export const DOCUMENT_TYPES = ["dni", "ce", "pasaporte", "ruc"] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_LABELS: Record<DocumentType, string> = {
  dni: "DNI",
  ce: "Carné de extranjería",
  pasaporte: "Pasaporte",
  ruc: "RUC",
};

/** Documentos de una persona; la empresa siempre usa RUC. */
export const PERSON_DOCUMENT_TYPES = ["dni", "ce", "pasaporte"] as const;

/** Quita espacios y guiones; los pasaportes pueden tener letras (en mayúsculas). */
export function normalizeDocument(type: DocumentType, value: string): string {
  const compact = value.replace(/[\s-]/g, "");
  return type === "pasaporte" ? compact.toUpperCase() : compact;
}

/** Valida el número ya normalizado según el tipo de documento. */
export function isValidDocument(type: DocumentType, value: string): boolean {
  switch (type) {
    case "dni":
      return /^\d{8}$/.test(value);
    case "ce":
      return /^\d{9,12}$/.test(value);
    case "pasaporte":
      return /^[A-Z0-9]{6,12}$/.test(value);
    case "ruc":
      return isValidRuc(value);
  }
}
