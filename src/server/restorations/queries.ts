import "server-only";

import type { PaymentType } from "@/domain/money";
import { depositPercentOf, toCents, type Cents } from "@/domain/money";
import type { DocumentType } from "@/domain/documents";
import { calendarDaysBetween } from "@/domain/piece-days";
import {
  toPieceStatus,
  type PieceEvent,
  type PieceStatus,
} from "@/domain/piece-state-machine";
import {
  observedProgress,
  partialProgress,
  toRestorationStatus,
  type ObservedProgress,
  type PartialProgress,
  type PieceLocation,
  type RestorationKind,
  type RestorationOrigin,
  type RestorationStatus,
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
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { signedPhotoUrls } from "@/server/files/queries";

export type PieceDetail = {
  id: string;
  number: number;
  code: string;
  status: PieceStatus;
  location: PieceLocation;
  /** Marca "Urgente" (P47). */
  urgent: boolean;
  /** Fecha estimada de entrega (AAAA-MM-DD): la llevan las urgentes; null si aún no la tiene. */
  estimatedDeliveryDate: string | null;
  /** Fecha estimada de entrega del taller (AAAA-MM-DD); null si no se indicó. */
  workshopDeliveryDate: string | null;
  /** Aprobada u Observada ya de vuelta del taller ("Lista para entregar"). */
  readyForDelivery: boolean;
  /** Cantidad: el precio de venta es por unidad (el total suma precio × cantidad). */
  quantity: number;
  description: string;
  measure: string;
  materialName: string;
  serviceName: string;
  weightGrams: number | null;
  workshopId: string | null;
  workshopName: string | null;
  /** Materiales del catálogo, en orden (materialName los junta con comas). */
  materialIds: string[];
  /** Servicios del catálogo, en orden (serviceName los junta con comas). */
  serviceIds: string[];
  notes: string;
  arrivedAt: string | null;
  createdAt: string;
  deliveredAt: string | null;
  /** Devuelta al cliente (rechazada o sin arreglo, P47). */
  returnedAt: string | null;
  /** Revisión en taller: último envío a revisar y última vuelta (sin dato: sin revisión). */
  reviewSentAt?: string | null;
  reviewReturnedAt?: string | null;
  /** Última vez que entró a Observada. */
  observedAt?: string | null;
  /** Viajes al taller por trabajo: primer y último envío, y última vuelta. */
  firstSentAt?: string | null;
  lastSentAt?: string | null;
  lastReturnedAt?: string | null;
  /** null si quien mira no ve montos (logística, P42) o si aún no tiene precio de venta (D58). */
  priceCents: Cents | null;
};

export type RestorationMoney = {
  totalCents: Cents;
  paidCents: Cents;
  expectedDepositCents: Cents;
  /**
   * % de adelanto "A cuenta": el guardado (restauraciones antiguas) o el calculado del
   * adelanto en soles cuando ya hay total; null si no hay.
   */
  depositPercent: number | null;
  /** Adelanto "A cuenta" escrito en soles; null si no se escribió (o es antiguo, en %). */
  depositAmountCents: Cents | null;
  paymentStatus: "pendiente" | "parcial" | "pagado" | "reembolsado";
};

export type RestorationDetail = {
  id: string;
  code: string;
  status: RestorationStatus;
  /** Tipo de guía: las internas u observadas no se cobran (sin precio, pagos ni orden). */
  kind: RestorationKind;
  paymentType: PaymentType;
  notes: string;
  shopifyOrderName: string | null;
  /** Id de la orden (solo admin y ventas), para enlazar al admin de Shopify. */
  shopifyOrderId: string | null;
  /** Oficina o WhatsApp; con WhatsApp, la cotización de la que salió (P46). */
  origin: RestorationOrigin;
  whatsappQuoteId: string | null;
  /** La orden de Shopify ya existe (cambia lo editable, P12). */
  hasOrder: boolean;
  createdAt: string;
  /** Quien registró la guía (id de su perfil). */
  createdBy: string | null;
  /** null si quien mira no ve clientes (logística). */
  client: {
    id: string;
    name: string;
    phone: string | null;
    kind: string;
    document: { type: DocumentType; number: string } | null;
  } | null;
  contact: { id: string; name: string; phone: string | null } | null;
  pieces: PieceDetail[];
  /** Solo para admin y ventas (P42). */
  money: RestorationMoney | null;
};

/**
 * Nombre de un usuario (p. ej. quien registró la guía). La RLS de `profiles` solo deja
 * leer el propio perfil, así que se lee con la clave del servidor y solo el nombre.
 */
export async function getProfileName(id: string): Promise<string | null> {
  const { data, error } = await createAdminClient()
    .from("profiles")
    .select("full_name")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data?.full_name ?? null;
}

/**
 * Nombre del cliente de una guía, para la versión para taller del PDF. Logística no lee
 * los clientes: la RPC `restoration_client_name` le da solo el nombre (de guías activas).
 */
export async function getRestorationClientName(
  id: string,
): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("restoration_client_name", {
    p_restoration_id: id,
  });
  if (error) throw error;
  return data ?? null;
}

/**
 * Detalle de una restauración. Los datos de las piezas salen de las vistas
 * `*_operational` (logística no ve las pasadas, D24), con el precio de venta de cada
 * pieza (admin, ventas y logística); totales y pagos solo se leen si `withMoney`
 * (admin y ventas; la RLS de las tablas lo exige igual). Cliente y
 * contacto solo se leen si `withClient` (admin y ventas): logística no los ve.
 */
export async function getRestorationDetail(
  id: string,
  { withMoney, withClient }: { withMoney: boolean; withClient: boolean },
): Promise<RestorationDetail | null> {
  const supabase = await createClient();
  const { data: r, error } = await supabase
    .from("restorations_operational")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!r?.id) return null;

  const [pieces, client, contact, money] = await Promise.all([
    supabase
      .from("pieces_operational")
      .select("*")
      .eq("restoration_id", id)
      .order("number"),
    withClient
      ? supabase
          .from("clients")
          .select(
            "id, display_name, phone, kind, document_type, document_number",
          )
          .eq("id", r.client_id!)
          .single()
      : Promise.resolve({ data: null, error: null }),
    withClient && r.contact_id
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
            "total, paid, expected_deposit, deposit_percent, deposit_amount, payment_status, shopify_order_id",
          )
          .eq("id", id)
          .single()
      : Promise.resolve({ data: null, error: null }),
  ]);
  for (const result of [pieces, client, contact, money]) {
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

  return {
    id: r.id,
    code: r.code!,
    status: toRestorationStatus(r.status!),
    kind: r.kind ?? "normal",
    paymentType: r.payment_type!,
    notes: r.notes ?? "",
    shopifyOrderName: r.shopify_order_name,
    shopifyOrderId: money.data?.shopify_order_id ?? null,
    origin: r.origin ?? "oficina",
    whatsappQuoteId: r.whatsapp_quote_id,
    hasOrder: Boolean(money.data?.shopify_order_id ?? r.shopify_order_name),
    createdAt: r.created_at!,
    createdBy: r.created_by,
    client: client.data
      ? {
          id: client.data.id,
          name: client.data.display_name ?? "",
          phone: client.data.phone,
          kind: client.data.kind,
          document:
            client.data.document_type && client.data.document_number
              ? {
                  type: client.data.document_type,
                  number: client.data.document_number,
                }
              : null,
        }
      : null,
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
      status: toPieceStatus(p.status!),
      location: p.location!,
      urgent: p.urgent ?? false,
      estimatedDeliveryDate: p.estimated_delivery_date,
      workshopDeliveryDate: p.workshop_delivery_date,
      readyForDelivery: p.ready_for_delivery ?? false,
      quantity: p.quantity ?? 1,
      description: p.description ?? "",
      measure: p.measure ?? "",
      materialName: p.material_name ?? "",
      serviceName: p.service_name ?? "",
      weightGrams: p.weight_grams === null ? null : Number(p.weight_grams),
      workshopId: p.workshop_id,
      materialIds: p.material_ids ?? [],
      serviceIds: p.service_ids ?? [],
      workshopName: p.workshop_id
        ? (workshopName.get(p.workshop_id) ?? null)
        : null,
      notes: p.notes ?? "",
      arrivedAt: p.arrived_at,
      createdAt: p.created_at!,
      deliveredAt: p.delivered_at,
      returnedAt: p.returned_at,
      reviewSentAt: p.review_sent_at,
      reviewReturnedAt: p.review_returned_at,
      observedAt: p.observed_at,
      firstSentAt: p.first_sent_at,
      lastSentAt: p.last_sent_at,
      lastReturnedAt: p.last_returned_at,
      // La vista da el precio a quien lo ve (null si el rol no lo ve o sin asignar).
      priceCents: p.price === null ? null : toCents(Number(p.price)),
    })),
    money: money.data
      ? {
          totalCents: toCents(Number(money.data.total)),
          paidCents: toCents(Number(money.data.paid)),
          expectedDepositCents: toCents(Number(money.data.expected_deposit)),
          depositAmountCents:
            money.data.deposit_amount === null
              ? null
              : toCents(Number(money.data.deposit_amount)),
          depositPercent:
            money.data.deposit_amount !== null
              ? depositPercentOf(
                  toCents(Number(money.data.deposit_amount)),
                  toCents(Number(money.data.total)),
                )
              : money.data.deposit_percent === null
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
    fromStatus: h.from_status ? toPieceStatus(h.from_status) : null,
    toStatus: toPieceStatus(h.to_status),
    actorName: h.actor_name,
    note: h.note,
  }));
}

/**
 * Estado al que volvería la pieza con "Retroceder estado" (null si no hay). Lo calcula
 * la BD del historial; también lo consulta logística, que no lo lee (P42).
 */
export async function getPreviousStatus(
  pieceId: string,
): Promise<PieceStatus | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("piece_previous_status", {
    p_piece_id: pieceId,
  });
  if (error) throw error;
  return data ? toPieceStatus(data) : null;
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
  /** Vacíos (clientId, clientName, contactName, documentNumber) si quien mira no ve clientes. */
  clientId: string;
  clientName: string;
  documentNumber: string | null;
  contactName: string | null;
  status: RestorationStatus;
  /** null para logística (no ve dinero, P42). */
  paymentStatus: RestorationMoney["paymentStatus"] | null;
  paymentType: PaymentType;
  piecesCount: number;
  /** Piezas en Observación sobre las piezas vivas; null si no hay ninguna observada. */
  observed: ObservedProgress | null;
  /** Piezas en Espera respuesta cliente (0 si ninguna). */
  waitingCount: number;
  totalCents: Cents | null;
  paidCents: Cents | null;
  balanceCents: Cents | null;
  createdAt: string;
  origin: RestorationOrigin;
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
  options: { all?: boolean; limit?: number; withClient?: boolean } = {},
): Promise<RestorationsPage> {
  // Logística no ve clientes: sin nombre, documento ni contacto en el listado.
  const withClient = options.withClient ?? true;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "list_restorations",
    listRestorationsArgs(filters, options),
  );
  if (error) throw error;
  const total = Number(data[0]?.total_count ?? 0);
  // La exportación trae todas las restauraciones y no muestra esto.
  const observed = options.all
    ? new Map<string, ObservedProgress>()
    : await getObservedProgress(data.map((r) => r.id));
  return {
    total,
    pages: Math.max(1, Math.ceil(total / RESTORATIONS_PAGE_SIZE)),
    items: data.map((r) => ({
      id: r.id,
      code: r.code,
      clientId: withClient ? r.client_id : "",
      clientName: withClient ? (r.client_name ?? "") : "",
      documentNumber: withClient ? r.document_number : null,
      contactName: withClient ? r.contact_name : null,
      status: toRestorationStatus(r.status),
      paymentStatus: r.payment_status,
      paymentType: r.payment_type,
      piecesCount: r.pieces_count,
      observed: observed.get(r.id) ?? null,
      waitingCount: r.waiting_count ?? 0,
      totalCents: centsOrNull(r.total),
      paidCents: centsOrNull(r.paid),
      balanceCents: centsOrNull(r.balance),
      createdAt: r.created_at,
      origin: r.origin,
    })),
  };
}

/**
 * Piezas en Observación de las restauraciones dadas ("2 de 4 piezas observadas").
 * Solo trae las piezas de las restauraciones que tienen alguna observada; las demás
 * no salen en el resultado.
 */
async function getObservedProgress(
  restorationIds: readonly string[],
): Promise<Map<string, ObservedProgress>> {
  const result = new Map<string, ObservedProgress>();
  if (restorationIds.length === 0) return result;
  const supabase = await createClient();
  const observed = await supabase
    .from("pieces_operational")
    .select("restoration_id")
    .in("restoration_id", [...restorationIds])
    .eq("status", "observada");
  if (observed.error) throw observed.error;
  const withObserved = [
    ...new Set(observed.data.map((p) => p.restoration_id!)),
  ];
  if (withObserved.length === 0) return result;
  const pieces = await supabase
    .from("pieces_operational")
    .select("restoration_id, status")
    .in("restoration_id", withObserved);
  if (pieces.error) throw pieces.error;
  for (const id of withObserved) {
    const progress = observedProgress(
      pieces.data
        .filter((p) => p.restoration_id === id && p.status)
        .map((p) => ({ status: toPieceStatus(p.status!) })),
    );
    if (progress) result.set(id, progress);
  }
  return result;
}

/** Cuántas restauraciones dan estos filtros (contadores de los chips). */
export async function countRestorations(
  filters: RestorationFilters,
): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "list_restorations",
    listRestorationsArgs({ ...filters, view: "tabla", page: 1 }, { limit: 1 }),
  );
  if (error) throw error;
  return Number(data[0]?.total_count ?? 0);
}

/**
 * Piezas de las restauraciones en estado parcial, para el avance del kanban
 * ("2/6 aprobadas", "2/6 listas"). Vacío si ninguna está en estado parcial.
 */
export async function getPartialProgress(
  items: readonly Pick<RestorationListItem, "id" | "status">[],
): Promise<Map<string, PartialProgress>> {
  const partial = items.filter(
    (r) =>
      r.status === "parcialmente_aprobada" || r.status === "parcialmente_lista",
  );
  const result = new Map<string, PartialProgress>();
  if (partial.length === 0) return result;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pieces_operational")
    .select(
      "restoration_id, status, approved_at, first_sent_at, ready_for_delivery",
    )
    .in(
      "restoration_id",
      partial.map((r) => r.id),
    );
  if (error) throw error;
  for (const r of partial) {
    const progress = partialProgress(
      r.status,
      data
        .filter((p) => p.restoration_id === r.id && p.status)
        .map((p) => ({
          status: toPieceStatus(p.status!),
          approvedAt: p.approved_at ? new Date(p.approved_at) : null,
          firstSentAt: p.first_sent_at ? new Date(p.first_sent_at) : null,
          readyForDelivery: p.ready_for_delivery ?? false,
        })),
    );
    if (progress) result.set(r.id, progress);
  }
  return result;
}

export type BoardPiece = {
  id: string;
  code: string;
  restorationId: string;
  restorationCode: string;
  /** Vacío si quien mira no ve clientes (logística). */
  clientName: string;
  description: string;
  status: PieceStatus;
  location: PieceLocation;
  urgent: boolean;
  /** Fecha estimada de entrega (AAAA-MM-DD) de las urgentes; null si aún no la tiene. */
  estimatedDeliveryDate: string | null;
  /** Fecha estimada de entrega del taller (AAAA-MM-DD); null si no se indicó. */
  workshopDeliveryDate: string | null;
  readyForDelivery: boolean;
  /** Rechazada o sin arreglo que sigue en la tienda (por devolver al cliente). */
  toReturn: boolean;
  /** Cantidad (el precio es por unidad). */
  quantity: number;
  /** Desde cuándo está en su ubicación actual (ISO); null si no se sabe. */
  locationSince: string | null;
  /** Días calendario (Lima) en la ubicación actual. */
  locationDays: number | null;
  /** Siempre null: las piezas ya devueltas al cliente no salen en la vista. */
  returnedAt: null;
  /** Última vez que entró a Observada. */
  observedAt?: string | null;
  /** Viajes al taller por trabajo: primer y último envío, y última vuelta. */
  firstSentAt?: string | null;
  lastSentAt?: string | null;
  lastReturnedAt?: string | null;
  /** Revisión en taller: último envío a revisar y última vuelta (sin dato: sin revisión). */
  reviewSentAt?: string | null;
  reviewReturnedAt?: string | null;
  workshopId: string | null;
  workshopName: string | null;
  arrivedAt: string | null;
  workshopDays: number;
  workshopOngoing: boolean;
  lastObservation: string | null;
  serviceName: string;
  materialName: string;
  measure: string;
  weightGrams: number | null;
  /** Lo que cobra el taller; null si aún no se define o si el rol no lo ve (ventas). */
  serviceCostCents: Cents | null;
  /** Precio de venta; null si está sin asignar o si el rol no lo ve (logística). */
  priceCents: Cents | null;
  /** La restauración ya tiene orden de Shopify (un precio asignado se cambia con motivo). */
  hasOrder: boolean;
  /** Primera foto "Antes" de la pieza (URL firmada de corta duración). */
  photoUrl: string | null;
  /** Días calendario en el estado actual (C5). */
  statusDays: number;
};

/**
 * Vista de piezas en curso (`list_pieces_board`): datos de la pieza, su primera foto
 * "Antes" y los montos que el rol ve (costo de servicio: admin y logística; precio de
 * venta: admin y ventas).
 */
export async function listPiecesBoard(
  filters: PieceBoardFilters,
  { withClient }: { withClient: boolean },
): Promise<{ items: BoardPiece[]; total: number; pages: number }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "list_pieces_board",
    listPiecesBoardArgs(filters),
  );
  if (error) throw error;
  const total = Number(data[0]?.total_count ?? 0);
  const [photos, since] = await Promise.all([
    signedPhotoUrls(data.flatMap((p) => (p.photo_path ? [p.photo_path] : []))),
    statusSince(data.map((p) => p.id)),
  ]);
  const now = new Date();
  return {
    total,
    pages: Math.max(1, Math.ceil(total / PIECES_PAGE_SIZE)),
    items: data.map((p) => ({
      id: p.id,
      code: p.code,
      restorationId: p.restoration_id,
      restorationCode: p.restoration_code,
      clientName: withClient ? (p.client_name ?? "") : "",
      description: p.description,
      status: toPieceStatus(p.status),
      location: p.location,
      urgent: p.urgent,
      estimatedDeliveryDate: p.estimated_delivery_date,
      workshopDeliveryDate: p.workshop_delivery_date,
      readyForDelivery: p.ready_for_delivery,
      toReturn: p.to_return ?? false,
      quantity: p.quantity ?? 1,
      locationSince: p.location_since ?? null,
      locationDays: p.location_since
        ? calendarDaysBetween(new Date(p.location_since), now)
        : null,
      returnedAt: null,
      observedAt: p.observed_at ?? null,
      firstSentAt: p.first_sent_at ?? null,
      lastSentAt: p.last_sent_at ?? null,
      lastReturnedAt: p.last_returned_at ?? null,
      reviewSentAt: p.review_sent_at ?? null,
      reviewReturnedAt: p.review_returned_at ?? null,
      workshopId: p.workshop_id,
      workshopName: p.workshop_name,
      arrivedAt: p.arrived_at,
      workshopDays: p.workshop_days,
      workshopOngoing: p.workshop_ongoing,
      lastObservation: p.last_observation,
      serviceName: p.service_name,
      materialName: p.material_name,
      measure: p.measure,
      weightGrams: p.weight_grams,
      serviceCostCents: centsOrNull(p.service_cost),
      priceCents: centsOrNull(p.price),
      hasOrder: p.has_order,
      photoUrl: p.photo_path ? (photos.get(p.photo_path) ?? null) : null,
      statusDays: since.has(p.id)
        ? calendarDaysBetween(new Date(since.get(p.id)!), now)
        : 0,
    })),
  };
}

/** Cuántas piezas dan estos filtros (contadores de los chips). */
export async function countPiecesBoard(
  filters: PieceBoardFilters,
): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_pieces_board", {
    ...listPiecesBoardArgs({ ...filters, view: "tabla", page: 1 }),
    p_limit: 1,
  });
  if (error) throw error;
  return Number(data[0]?.total_count ?? 0);
}

/** Desde cuándo cada pieza está en su estado actual (`piece_status_since`). */
async function statusSince(pieceIds: string[]): Promise<Map<string, string>> {
  if (pieceIds.length === 0) return new Map();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("piece_status_since", {
    p_piece_ids: pieceIds,
  });
  if (error) throw error;
  return new Map(data.map((r) => [r.piece_id, r.since]));
}
