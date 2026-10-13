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

/** Campos libres para ventas: el taller lo asignan logística y el admin (D60). */
export const SALES_PIECE_FIELDS = PIECE_FREE_FIELDS.filter(
  (field) => field !== "workshopId",
);

/** Explicación del taller bloqueado para ventas (D60). */
export const WORKSHOP_HINT = "Lo asignan logística y el administrador.";

/** Explicación del precio de venta bloqueado para quien no es admin (D58). */
export const SALE_PRICE_HINT =
  "Solo el administrador asigna el precio de venta.";

export type EditContext = {
  role: AppRole;
  /** La orden de Shopify ya existe (Fase 9). */
  hasOrder: boolean;
};

export type EditableFields = {
  restoration: readonly RestorationEditableField[];
  /** Campos editables de la pieza; sin pieza, los de una pieza nueva. */
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
 * Logística no edita nada (solo sube fotos, Fase 10; el taller lo asigna con sus
 * acciones). Ventas no cambia el taller (D60). Una pieza anulada, rechazada o
 * sin arreglo no se edita;
 * de una entregada solo las notas. El precio de venta lo asigna y cambia solo el
 * admin (D58): una pieza sin precio lo recibe siempre (así entra a la orden); con la
 * orden creada, un precio ya asignado sigue el flujo de P12 (Paso 9.2). Las piezas
 * nuevas se agregan siempre: llegan a Shopify cuando se aprueban.
 */
export function editableFields(
  ctx: EditContext,
  piece?: { status: PieceStatus; priceCents?: number | null },
): EditableFields {
  if (!canEdit(ctx.role)) return NOTHING;
  const admin = ctx.role === "admin";
  const free = admin ? PIECE_FREE_FIELDS : SALES_PIECE_FIELDS;
  const base = {
    restoration: RESTORATION_EDITABLE_FIELDS,
    canAddPieces: true,
  };
  if (!piece) {
    return {
      ...base,
      piece: admin ? [...free, "price"] : free,
      priceNeedsOrderFlow: false,
    };
  }
  if (isClosedStatus(piece.status)) {
    return { ...base, piece: [], priceNeedsOrderFlow: false };
  }
  const withoutPrice = piece.priceCents == null;
  if (piece.status === "entregada") {
    return {
      ...base,
      piece: admin && withoutPrice ? ["notes", "price"] : ["notes"],
      priceNeedsOrderFlow: false,
    };
  }
  if (!ctx.hasOrder || withoutPrice) {
    return {
      ...base,
      piece: admin ? [...free, "price"] : free,
      priceNeedsOrderFlow: false,
    };
  }
  return {
    ...base,
    piece: free,
    priceNeedsOrderFlow: admin,
  };
}
