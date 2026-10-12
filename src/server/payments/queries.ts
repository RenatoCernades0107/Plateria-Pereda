import "server-only";

import { toCents, type Cents } from "@/domain/money";
import type { PaymentKind } from "@/domain/payments";
import { createClient } from "@/lib/supabase/server";

export type PaymentRecord = {
  id: string;
  kind: PaymentKind;
  amountCents: Cents;
  methodName: string;
  paidOn: string;
  reason: string;
  source: "sistema" | "shopify";
  /** Ya llegó a Shopify; si no, queda pendiente de envío (11.2). */
  syncedToShopify: boolean;
  createdByName: string | null;
  createdAt: string;
};

/** Pagos y reembolsos de la restauración (solo admin y ventas, P42). */
export async function listPayments(
  restorationId: string,
): Promise<PaymentRecord[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payments")
    .select(
      "id, kind, amount, method_name, paid_on, reason, source, shopify_synced_at, created_by_name, created_at",
    )
    .eq("restoration_id", restorationId)
    .order("created_at");
  if (error) throw error;
  return data.map((p) => ({
    id: p.id,
    kind: p.kind,
    amountCents: toCents(Number(p.amount)),
    methodName: p.method_name,
    paidOn: p.paid_on,
    reason: p.reason,
    source: p.source,
    syncedToShopify: p.shopify_synced_at !== null,
    createdByName: p.created_by_name,
    createdAt: p.created_at,
  }));
}

/** ¿Falta cobrar el saldo para entregar? (P45). Sin montos: también para logística. */
export async function getBalanceDue(restorationId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("restorations_balance_due", {
    p_restoration_ids: [restorationId],
  });
  if (error) throw error;
  return data[0]?.balance_due ?? false;
}
