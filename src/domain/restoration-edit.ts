import type { AppRole } from "@/lib/roles";

import { isClosedStatus, type PieceStatus } from "./piece-state-machine";

/**
 * Qué se puede editar de una restauración y sus piezas (Paso 7.7, P12). La BD lo
 * vuelve a exigir (privilegios por columna y el trigger `guard_piece_edit`).
 */

export const RESTORATION_EDITABLE_FIELDS = [
  "contactId",
  "paymentType",
  "depositPercent",
  "notes",
] as const;
export type RestorationEditableField =
  (typeof RESTORATION_EDITABLE_FIELDS)[number];

/** Campos de la pieza que no tocan Shopify (el título de la línea lleva solo el código). */
export const PIECE_FREE_FIELDS = [
  "description",
  "service",
  "measure",
  "material",
  "weight",
  "workshopId",
  "notes",
  "urgent",
] as const;
export type PieceEditableField = (typeof PIECE_FREE_FIELDS)[number] | "price";

export type EditContext = {
  role: AppRole;
  /** La orden de Shopify ya existe (Fase 9). */
  hasOrder: boolean;
};

export type EditableFields = {
  restoration: readonly RestorationEditableField[];
  piece: readonly PieceEditableField[];
  /** El precio se cambia, pero por el flujo de la orden (motivo y edición en Shopify, 9.2). */
  priceNeedsOrderFlow: boolean;
  canAddPieces: boolean;
};

const NOTHING: EditableFields = {
  restoration: [],
  piece: [],
  priceNeedsOrderFlow: false,
  canAddPieces: false,
};

const canEdit = (role: AppRole) => role === "admin" || role === "ventas";

/**
 * Campos editables según el rol, si existe la orden y el estado de la pieza.
 * Logística no edita nada (solo sube fotos, Fase 10). Una pieza anulada, rechazada o
 * sin arreglo no se edita;
 * de una entregada solo las notas. Con la orden creada, el precio sigue el flujo
 * de P12 (solo admin, Paso 9.2). Las piezas nuevas se agregan siempre: llegan a
 * Shopify cuando se aprueban.
 */
export function editableFields(
  ctx: EditContext,
  piece?: { status: PieceStatus },
): EditableFields {
  if (!canEdit(ctx.role)) return NOTHING;
  const base = {
    restoration: RESTORATION_EDITABLE_FIELDS,
    canAddPieces: true,
  };
  if (!piece) return { ...base, piece: [], priceNeedsOrderFlow: false };
  if (isClosedStatus(piece.status)) {
    return { ...base, piece: [], priceNeedsOrderFlow: false };
  }
  if (piece.status === "entregada") {
    return { ...base, piece: ["notes"], priceNeedsOrderFlow: false };
  }
  if (!ctx.hasOrder) {
    return {
      ...base,
      piece: [...PIECE_FREE_FIELDS, "price"],
      priceNeedsOrderFlow: false,
    };
  }
  return {
    ...base,
    piece: PIECE_FREE_FIELDS,
    priceNeedsOrderFlow: ctx.role === "admin",
  };
}
