import "server-only";

import type { PaymentType } from "@/domain/money";
import { toCents, type Cents } from "@/domain/money";
import type { PieceStatus } from "@/domain/piece-state-machine";
import type {
  PieceLocation,
  RestorationStatus,
} from "@/domain/restoration-status";
import { createClient } from "@/lib/supabase/server";

export type PieceDetail = {
  id: string;
  number: number;
  code: string;
  status: PieceStatus;
  location: PieceLocation;
  description: string;
  measure: string;
  materialName: string;
  serviceName: string;
  weightGrams: number | null;
  workshopId: string | null;
  workshopName: string | null;
  materialId: string | null;
  serviceId: string | null;
  notes: string;
  arrivedAt: string | null;
  createdAt: string;
  deliveredAt: string | null;
  /** null si quien mira no ve montos (logística, P42). */
  priceCents: Cents | null;
};

export type RestorationMoney = {
  totalCents: Cents;
  paidCents: Cents;
  expectedDepositCents: Cents;
  depositPercent: number | null;
  paymentStatus: "pendiente" | "parcial" | "pagado" | "reembolsado";
};

export type RestorationDetail = {
  id: string;
  code: string;
  status: RestorationStatus;
  paymentType: PaymentType;
  notes: string;
  shopifyOrderName: string | null;
  /** La orden de Shopify ya existe (cambia lo editable, P12). */
  hasOrder: boolean;
  createdAt: string;
  client: { id: string; name: string; phone: string | null; kind: string };
  contact: { id: string; name: string; phone: string | null } | null;
  pieces: PieceDetail[];
  /** Solo para admin y ventas (P42). */
  money: RestorationMoney | null;
};

/**
 * Detalle de una restauración. Los datos sin dinero salen de las vistas
 * `*_operational` (logística no ve las pasadas, D24); los montos solo se leen si
 * `withMoney` (admin y ventas; la RLS de las tablas lo exige igual).
 */
export async function getRestorationDetail(
  id: string,
  { withMoney }: { withMoney: boolean },
): Promise<RestorationDetail | null> {
  const supabase = await createClient();
  const { data: r, error } = await supabase
    .from("restorations_operational")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!r?.id) return null;

  const [pieces, client, contact, money, prices] = await Promise.all([
    supabase
      .from("pieces_operational")
      .select("*")
      .eq("restoration_id", id)
      .order("number"),
    supabase
      .from("clients")
      .select("id, display_name, phone, kind")
      .eq("id", r.client_id!)
      .single(),
    r.contact_id
      ? supabase
          .from("contacts")
          .select("id, display_name, phone")
          .eq("id", r.contact_id)
          .single()
      : Promise.resolve({ data: null, error: null }),
    withMoney
      ? supabase
          .from("restorations")
          .select(
            "total, paid, expected_deposit, deposit_percent, payment_status, shopify_order_id",
          )
          .eq("id", id)
          .single()
      : Promise.resolve({ data: null, error: null }),
    withMoney
      ? supabase.from("pieces").select("id, price").eq("restoration_id", id)
      : Promise.resolve({ data: [], error: null }),
  ]);
  for (const result of [pieces, client, contact, money, prices]) {
    if (result.error) throw result.error;
  }

  const workshopIds = [
    ...new Set(pieces.data!.map((p) => p.workshop_id).filter(Boolean)),
  ] as string[];
  const workshops = workshopIds.length
    ? await supabase.from("workshops").select("id, name").in("id", workshopIds)
    : { data: [], error: null };
  if (workshops.error) throw workshops.error;
  const workshopName = new Map(workshops.data!.map((w) => [w.id, w.name]));
  const priceOf = new Map(
    (prices.data ?? []).map((p) => [p.id, toCents(Number(p.price))]),
  );

  return {
    id: r.id,
    code: r.code!,
    status: r.status!,
    paymentType: r.payment_type!,
    notes: r.notes ?? "",
    shopifyOrderName: r.shopify_order_name,
    hasOrder: Boolean(money.data?.shopify_order_id ?? r.shopify_order_name),
    createdAt: r.created_at!,
    client: {
      id: client.data!.id,
      name: client.data!.display_name ?? "",
      phone: client.data!.phone,
      kind: client.data!.kind,
    },
    contact: contact.data
      ? {
          id: contact.data.id,
          name: contact.data.display_name ?? "",
          phone: contact.data.phone,
        }
      : null,
    pieces: pieces.data!.map((p) => ({
      id: p.id!,
      number: p.number!,
      code: p.code!,
      status: p.status!,
      location: p.location!,
      description: p.description ?? "",
      measure: p.measure ?? "",
      materialName: p.material_name ?? "",
      serviceName: p.service_name ?? "",
      weightGrams: p.weight_grams === null ? null : Number(p.weight_grams),
      workshopId: p.workshop_id,
      materialId: p.material_id,
      serviceId: p.service_id,
      workshopName: p.workshop_id
        ? (workshopName.get(p.workshop_id) ?? null)
        : null,
      notes: p.notes ?? "",
      arrivedAt: p.arrived_at,
      createdAt: p.created_at!,
      deliveredAt: p.delivered_at,
      priceCents: withMoney ? (priceOf.get(p.id!) ?? null) : null,
    })),
    money: money.data
      ? {
          totalCents: toCents(Number(money.data.total)),
          paidCents: toCents(Number(money.data.paid)),
          expectedDepositCents: toCents(Number(money.data.expected_deposit)),
          depositPercent:
            money.data.deposit_percent === null
              ? null
              : Number(money.data.deposit_percent),
          paymentStatus: money.data.payment_status,
        }
      : null,
  };
}
