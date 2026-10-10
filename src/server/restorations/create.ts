import type { SupabaseClient } from "@supabase/supabase-js";

import { toDecimalString } from "@/domain/money";
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
    description: piece.description,
    measure: piece.measure,
    material_id: piece.material?.id ?? null,
    material_name: piece.material?.name ?? "",
    service_id: piece.service?.id ?? null,
    service_name: piece.service?.name ?? "",
    weight_grams:
      piece.weightGrams === null ? null : piece.weightGrams.toFixed(2),
    price: toDecimalString(piece.priceCents),
    urgent: piece.urgent,
    notes: piece.notes,
    quote_item_id: piece.quoteItemId ?? null,
    // Estado inicial de la copia desde WhatsApp (P49); las demás RPC lo ignoran.
    status: piece.initialStatus ?? null,
    status_note: piece.statusNote ?? "",
  };
}

/** Registra la restauración y sus piezas en una sola transacción (RPC). */
export async function createRestorationRecord(
  supabase: SupabaseClient<Database>,
  input: RestorationInput,
): Promise<CreatedRestoration> {
  const { data, error } = await supabase
    .rpc("create_restoration", {
      p_client_id: input.clientId,
      p_contact_id: input.contactId as string,
      p_payment_type: input.paymentType,
      p_deposit_percent: input.depositPercent as number,
      p_notes: input.notes,
      p_pieces: input.pieces.map(pieceToRpc),
      p_prices_include_igv: input.pricesIncludeIgv,
    })
    .single();
  if (error) throw error;
  return data;
}
