import "server-only";

import type { PaymentType } from "@/domain/money";
import { toCents, type Cents } from "@/domain/money";
import type { PieceEvent, PieceStatus } from "@/domain/piece-state-machine";
import type {
  PieceLocation,
  RestorationStatus,
} from "@/domain/restoration-status";
import {
  listPiecesBoardArgs,
  PIECES_PAGE_SIZE,
  type PieceBoardFilters,
} from "@/domain/piece-board-filters";
import {
  listRestorationsArgs,
  RESTORATIONS_PAGE_SIZE,
  type RestorationFilters,
} from "@/domain/restoration-filters";
import { createClient } from "@/lib/supabase/server";

export type PieceDetail = {
  id: string;
  number: number;
  code: string;
  status: PieceStatus;
  location: PieceLocation;
  /** Marca "Urgente" (P47). */
  urgent: boolean;
  /** En Interno y ya de vuelta del taller. */
  readyForDelivery: boolean;
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
  /** Devuelta al cliente (rechazada o sin arreglo, P47). */
  returnedAt: string | null;
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
      urgent: p.urgent ?? false,
      readyForDelivery: p.ready_for_delivery ?? false,
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
      returnedAt: p.returned_at,
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

export type PieceTimelineEvent = {
  pieceId: string;
  /** Cambio de estado, llegada, vuelta del taller o devolución al cliente (P47). */
  event: PieceEvent;
  at: string;
  fromStatus: PieceStatus | null;
  toStatus: PieceStatus;
  actorName: string | null;
  note: string | null;
};

/** Historial de estados de las piezas (admin y ventas; la RLS lo exige). */
export async function getStatusHistory(
  restorationId: string,
): Promise<PieceTimelineEvent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("piece_status_history")
    .select(
      "piece_id, event, occurred_at, from_status, to_status, actor_name, note",
    )
    .eq("restoration_id", restorationId)
    .order("occurred_at")
    .order("id");
  if (error) throw error;
  return data.map((h) => ({
    pieceId: h.piece_id,
    event: h.event,
    at: h.occurred_at,
    fromStatus: h.from_status,
    toStatus: h.to_status,
    actorName: h.actor_name,
    note: h.note,
  }));
}

export type LogisticsPieceInfo = {
  workshopDays: number;
  workshopOngoing: boolean;
  lastObservation: string | null;
};

/** Para logística: días en taller y última observación de cada pieza (P42). */
export async function getLogisticsInfo(
  restorationId: string,
): Promise<Map<string, LogisticsPieceInfo>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("piece_logistics_info", {
    p_restoration_id: restorationId,
  });
  if (error) throw error;
  return new Map(
    data.map((row) => [
      row.piece_id,
      {
        workshopDays: row.workshop_days,
        workshopOngoing: row.workshop_ongoing,
        lastObservation: row.last_observation,
      },
    ]),
  );
}

export type RestorationListItem = {
  id: string;
  code: string;
  clientId: string;
  clientName: string;
  documentNumber: string | null;
  contactName: string | null;
  status: RestorationStatus;
  /** null para logística (no ve dinero, P42). */
  paymentStatus: RestorationMoney["paymentStatus"] | null;
  paymentType: PaymentType;
  piecesCount: number;
  totalCents: Cents | null;
  paidCents: Cents | null;
  balanceCents: Cents | null;
  createdAt: string;
};

export type RestorationsPage = {
  items: RestorationListItem[];
  total: number;
  pages: number;
};

const centsOrNull = (value: number | null) =>
  value === null ? null : toCents(Number(value));

/** Listado con filtros, orden y paginación en la BD (`list_restorations`). */
export async function listRestorations(
  filters: RestorationFilters,
  options: { all?: boolean } = {},
): Promise<RestorationsPage> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "list_restorations",
    listRestorationsArgs(filters, options),
  );
  if (error) throw error;
  const total = Number(data[0]?.total_count ?? 0);
  return {
    total,
    pages: Math.max(1, Math.ceil(total / RESTORATIONS_PAGE_SIZE)),
    items: data.map((r) => ({
      id: r.id,
      code: r.code,
      clientId: r.client_id,
      clientName: r.client_name ?? "",
      documentNumber: r.document_number,
      contactName: r.contact_name,
      status: r.status,
      paymentStatus: r.payment_status,
      paymentType: r.payment_type,
      piecesCount: r.pieces_count,
      totalCents: centsOrNull(r.total),
      paidCents: centsOrNull(r.paid),
      balanceCents: centsOrNull(r.balance),
      createdAt: r.created_at,
    })),
  };
}

export type BoardPiece = {
  id: string;
  code: string;
  restorationId: string;
  restorationCode: string;
  clientName: string;
  description: string;
  status: PieceStatus;
  location: PieceLocation;
  urgent: boolean;
  readyForDelivery: boolean;
  /** Siempre null: las piezas ya devueltas al cliente no salen en la vista. */
  returnedAt: null;
  workshopId: string | null;
  workshopName: string | null;
  arrivedAt: string | null;
  workshopDays: number;
  workshopOngoing: boolean;
  lastObservation: string | null;
};

/** Vista operativa de piezas en curso, sin precios (`list_pieces_board`). */
export async function listPiecesBoard(
  filters: PieceBoardFilters,
): Promise<{ items: BoardPiece[]; total: number; pages: number }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "list_pieces_board",
    listPiecesBoardArgs(filters),
  );
  if (error) throw error;
  const total = Number(data[0]?.total_count ?? 0);
  return {
    total,
    pages: Math.max(1, Math.ceil(total / PIECES_PAGE_SIZE)),
    items: data.map((p) => ({
      id: p.id,
      code: p.code,
      restorationId: p.restoration_id,
      restorationCode: p.restoration_code,
      clientName: p.client_name ?? "",
      description: p.description,
      status: p.status,
      location: p.location,
      urgent: p.urgent,
      readyForDelivery: p.ready_for_delivery,
      returnedAt: null,
      workshopId: p.workshop_id,
      workshopName: p.workshop_name,
      arrivedAt: p.arrived_at,
      workshopDays: p.workshop_days,
      workshopOngoing: p.workshop_ongoing,
      lastObservation: p.last_observation,
    })),
  };
}
