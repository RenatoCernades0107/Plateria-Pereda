import { PIECE_STATUS_LABELS, type PieceStatus } from "./piece-state-machine";
import { isChargedKind, type RestorationKind } from "./restoration-status";

/**
 * Campos obligatorios por estado (K10 de MejorasUI.md): la pieza no pasa a un estado
 * (ni se recibe del taller) hasta tener cargado lo que ese paso exige. Así no se
 * aprueban piezas sin precio ni se entregan sin foto "Después".
 */

export type RequirementFacts = {
  code: string;
  hasPrice: boolean;
  hasServiceCost: boolean;
  workshopId: string | null;
  hasAfterPhoto: boolean;
  /** Tipo de guía: las que no se cobran (interna u observada) no piden precio. */
  restorationKind?: RestorationKind;
};

export type RequiredField = "precio" | "taller" | "costo" | "foto_despues";

/** Qué falta, en palabras del usuario, y dónde se completa. */
export const REQUIRED_FIELD_LABELS: Record<RequiredField, string> = {
  precio: "el precio de venta",
  taller: "el taller",
  costo: "el costo de servicio",
  foto_despues: "la foto «Después»",
};

/** Paso que se valida: un cambio de estado, "Enviar al taller" o "Recibir del taller". */
export type RequirementStep = PieceStatus | "enviar_taller" | "recibir_taller";

/** Campos obligatorios de cada paso (los que no figuran no exigen nada). */
export const REQUIRED_FIELDS: Partial<
  Record<RequirementStep, readonly RequiredField[]>
> = {
  aprobada: ["precio"],
  enviar_taller: ["taller"],
};

const has = (
  field: RequiredField,
  facts: RequirementFacts,
  workshopId: string | null,
) => {
  switch (field) {
    case "precio":
      return facts.hasPrice || !isChargedKind(facts.restorationKind);
    case "taller":
      return Boolean(workshopId ?? facts.workshopId);
    case "costo":
      return facts.hasServiceCost;
    case "foto_despues":
      return facts.hasAfterPhoto;
  }
};

/** Campos que le faltan a la pieza para ese paso (`workshopId`: el elegido en el diálogo). */
export function missingFields(
  step: RequirementStep,
  facts: RequirementFacts,
  workshopId: string | null = null,
): RequiredField[] {
  return (REQUIRED_FIELDS[step] ?? []).filter(
    (field) => !has(field, facts, workshopId),
  );
}

const stepLabel = (step: RequirementStep, plural = false) => {
  const them = plural ? "las" : "la";
  if (step === "recibir_taller") return `recibir${them} del taller`;
  if (step === "enviar_taller") return `enviar${them} al taller`;
  return `pasar${them} a «${PIECE_STATUS_LABELS[step]}»`;
};

const joinEs = (items: string[]) =>
  items.length <= 1
    ? (items[0] ?? "")
    : `${items.slice(0, -1).join(", ")} y ${items.at(-1)}`;

/**
 * Mensaje claro con lo que falta, o null si se puede. Con varias piezas nombra cada
 * una con sus faltantes.
 */
export function requirementsError(
  step: RequirementStep,
  pieces: readonly RequirementFacts[],
  workshopId: string | null = null,
): string | null {
  const missing = pieces
    .map((p) => ({ code: p.code, fields: missingFields(step, p, workshopId) }))
    .filter((m) => m.fields.length > 0);
  if (missing.length === 0) return null;
  const what = (fields: RequiredField[]) =>
    joinEs(fields.map((f) => REQUIRED_FIELD_LABELS[f]));
  if (missing.length === 1) {
    const [only] = missing;
    return `Falta ${what(only!.fields)} de ${only!.code} para ${stepLabel(step)}. Complétalo en el detalle de la pieza.`;
  }
  return `Para ${stepLabel(step, true)} falta: ${missing
    .map((m) => `${m.code} (${what(m.fields)})`)
    .join("; ")}. Complétalo en el detalle de cada pieza.`;
}
