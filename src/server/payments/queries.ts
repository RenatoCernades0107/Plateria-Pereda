import "server-only";

import { toCents, type Cents } from "@/domain/money";
import type { PaymentKind } from "@/domain/payments";
import { serverEnv } from "@/lib/env.server";
import { createClient } from "@/lib/supabase/server";
import { shopifyOrderAdminUrl } from "@/server/shopify/admin-url";

export type PaymentRecord = {
  id: string;
  kind: PaymentKind;
  amountCents: Cents;
  methodName: string;
  /** Sucursal que cobró (va como etiqueta del pedido); null si no tiene. */
  branchName: string | null;
  paidOn: string;
  reason: string;
  source: "sistema" | "shopify";
  /** Ya llegó a Shopify; si no, queda pendiente de envío (11.2). */
  syncedToShopify: boolean;
  /** Registrado solo en el sistema por el admin: no tiene pedido en Shopify. */
  skipShopify: boolean;
  /**
   * Pedido de Shopify del pago (un pedido por pago): el nombre que se le da
   * ("Adelanto Guía RES-00043 A1"), el que muestra Shopify y el enlace al admin. null
   * en las guías con la orden de piezas.
   */
  orderTitle: string | null;
  orderName: string | null;
  orderUrl: string | null;
  /** Reembolso: el pago que devuelve. */
  refundedPaymentId: string | null;
  /** Pago: lo que aún se puede reembolsar de él. */
  refundableCents: Cents;
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
      "id, kind, amount, method_name, branch_name, paid_on, reason, source, shopify_synced_at, skip_shopify, shopify_order_title, shopify_order_id, shopify_order_name, refunded_payment_id, created_by_name, created_at",
    )
    .eq("restoration_id", restorationId)
    .order("created_at");
  if (error) throw error;
  const refunded = new Map<string, Cents>();
  for (const p of data) {
    if (p.refunded_payment_id)
      refunded.set(
        p.refunded_payment_id,
        (refunded.get(p.refunded_payment_id) ?? 0) + toCents(Number(p.amount)),
      );
  }
  const shop = serverEnv().SHOPIFY_STORE_DOMAIN;
  return data.map((p) => {
    const amountCents = toCents(Number(p.amount));
    return {
      id: p.id,
      kind: p.kind,
      amountCents,
      methodName: p.method_name,
      branchName: p.branch_name,
      paidOn: p.paid_on,
      reason: p.reason,
      source: p.source,
      syncedToShopify: p.shopify_synced_at !== null,
      skipShopify: p.skip_shopify,
      orderTitle: p.shopify_order_title,
      orderName: p.shopify_order_name,
      orderUrl: shopifyOrderAdminUrl(shop, p.shopify_order_id),
      refundedPaymentId: p.refunded_payment_id,
      refundableCents:
        p.kind === "pago" ? amountCents - (refunded.get(p.id) ?? 0) : 0,
      createdByName: p.created_by_name,
      createdAt: p.created_at,
    };
  });
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
