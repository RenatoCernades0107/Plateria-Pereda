import type { SupabaseClient } from "@supabase/supabase-js";

import { toDecimalString, toSoles } from "@/domain/money";
import type { RestorationKind } from "@/domain/restoration-status";
import type { Database } from "@/lib/supabase/database.types";
import type {
  PieceInput,
  RestorationInput,
} from "@/lib/validation/restorations";

export type CreatedRestoration = { id: string; code: string };

/** Pieza en el formato que espera la función `create_restoration` de la BD. */
export function pieceToRpc(piece: PieceInput) {
  return {
    workshop_id: piece.workshopId,
    // Informativa: el precio y el costo son de la pieza completa.
    quantity: piece.quantity,
    description: piece.description,
    measure: piece.measure,
    // El primer material y los nombres los deriva la BD (trigger pieces_catalogs_link).
    material_ids: piece.materials,
    // El primer servicio y los nombres los deriva la BD (trigger pieces_catalogs_link).
    service_ids: piece.services,
    weight_grams:
      piece.weightGrams === null ? null : piece.weightGrams.toFixed(2),
    // Sin precio de venta (D58): queda sin asignar.
    price: piece.priceCents === null ? null : toDecimalString(piece.priceCents),
    urgent: piece.urgent,
    notes: piece.notes,
    quote_item_id: piece.quoteItemId ?? null,
    // Estado inicial de la copia desde WhatsApp (P49); las demás RPC lo ignoran.
    status: piece.initialStatus ?? null,
    status_note: piece.statusNote ?? "",
  };
}

/**
 * Sin el permiso del precio de venta (D58) las piezas quedan sin precio; en la copia
 * de una cotización de WhatsApp se conserva el precio cotizado (la BD lo verifica).
 */
export function withoutSalePrices<T extends PieceInput>(
  pieces: readonly T[],
  { keepQuoted = false }: { keepQuoted?: boolean } = {},
): T[] {
  return pieces.map((piece) =>
    keepQuoted && piece.quoteItemId ? piece : { ...piece, priceCents: null },
  );
}

/** Sin el permiso del taller (ventas, D60) las piezas se registran sin taller. */
export function withoutWorkshops<T extends PieceInput>(
  pieces: readonly T[],
): T[] {
  return pieces.map((piece) => ({ ...piece, workshopId: null }));
}

/** Registra la restauración y sus piezas en una sola transacción (RPC). */
export async function createRestorationRecord(
  supabase: SupabaseClient<Database>,
  input: Omit<RestorationInput, "kind"> & { kind?: RestorationKind },
): Promise<CreatedRestoration> {
  const kind = input.kind ?? "normal";
  const { data, error } = await supabase
    .rpc("create_restoration", {
      p_client_id: input.clientId,
      p_contact_id: input.contactId as string,
      p_payment_type: kind === "normal" ? input.paymentType : "sin_definir",
      // El adelanto se escribe en soles; el % antiguo ya no se usa en lo nuevo.
      p_deposit_percent: null as unknown as number,
      p_deposit_amount:
        input.depositAmount === null || kind !== "normal"
          ? undefined
          : toSoles(input.depositAmount),
      p_notes: input.notes,
      p_pieces: input.pieces.map(pieceToRpc),
      // Interna u observada: la BD ignora precio, tipo de pago y adelanto.
      p_kind: kind,
    })
    .single();
  if (error) throw error;
  return data;
}
