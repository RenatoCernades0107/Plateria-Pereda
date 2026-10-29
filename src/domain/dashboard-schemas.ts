import { z } from "zod";

/**
 * Forma de lo que devuelven las funciones `dashboard_*` de la BD (jsonb). Se validan al
 * leerlas para que un cambio del SQL falle con un error claro y no en un gráfico.
 */

const num = z.number();
const nullableNum = z.number().nullable();
const day = z.string();
const labelValue = z.object({ label: z.string(), value: num });
const keyValue = z.object({ key: z.string(), value: num });

export const summarySchema = z.object({
  from: day,
  to: day,
  bucket: z.string(),
  sold: num,
  sold_orders: num,
  sold_pieces: num,
  ticket: num,
  collected: num,
  refunds: num,
  balance_due: num,
  orders: num,
  delivered: num,
  fulfillment_avg: nullableNum,
  fulfillment_median: nullableNum,
  new_clients: num,
  cwa_created: num,
  cwa_converted: num,
  cwa_conversion: nullableNum,
  margin: nullableNum,
  margin_pct: nullableNum,
  series: z.array(z.object({ d: day, vendido: num, cobrado: num, guias: num })),
});
export type DashboardSummary = z.infer<typeof summarySchema>;

export const salesSchema = z.object({
  from: day,
  to: day,
  bucket: z.string(),
  sold: num,
  collected: num,
  collection_rate: nullableNum,
  series: z.array(z.object({ d: day, vendido: num, cobrado: num })),
  by_method: z.array(labelValue),
  by_origin: z.array(
    z.object({ key: z.string(), sold: num, orders: num, ticket: num }),
  ),
  by_payment_type: z.array(keyValue),
  by_service: z.array(labelValue),
  by_material: z.array(labelValue),
  margin: z
    .object({
      margin: num,
      base: num,
      cost: num,
      pieces: num,
      pieces_without_cost: num,
    })
    .nullable(),
});
export type DashboardSales = z.infer<typeof salesSchema>;

export const ordersSchema = z.object({
  from: day,
  to: day,
  bucket: z.string(),
  orders: num,
  pieces_per_order: nullableNum,
  by_status: z.array(keyValue),
  by_kind: z.array(keyValue),
  by_location: z.array(keyValue),
  funnel: z.object({
    registered: num,
    approved: num,
    delivered: num,
    in_consultation: num,
    rejected: num,
    no_fix: num,
    cancelled: num,
    urgent: num,
  }),
  fulfillment: z.object({
    delivered: num,
    avg: nullableNum,
    median: nullableNum,
    p90: nullableNum,
    buckets: z.array(labelValue),
  }),
  series: z.array(z.object({ d: day, guias: num, entregadas: num })),
});
export type DashboardOrders = z.infer<typeof ordersSchema>;

export const clientsSchema = z.object({
  from: day,
  to: day,
  bucket: z.string(),
  total_active: num,
  new_clients: num,
  active_in_range: num,
  returning: num,
  repeat_rate: nullableNum,
  new_by_kind: z.array(keyValue),
  top_clients: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      orders: num,
      pieces: num,
      sold: num,
      last_at: day.nullable(),
    }),
  ),
  regions: z.array(
    z.object({ region: z.string(), orders: num, clients: num, sold: num }),
  ),
  top_debtors: z.array(
    z.object({ id: z.string(), name: z.string(), orders: num, due: num }),
  ),
  series: z.array(z.object({ d: day, nuevos: num })),
});
export type DashboardClients = z.infer<typeof clientsSchema>;

export const workshopRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  active: z.boolean(),
  returned: num,
  avg_days: nullableNum,
  median_days: nullableNum,
  max_days: nullableNum,
  sent: num,
  observed: num,
  in_workshop: num,
  over_alert: num,
  max_now_days: nullableNum,
  cost: nullableNum,
  avg_cost: nullableNum,
});
export type DashboardWorkshopRow = z.infer<typeof workshopRowSchema>;

export const workshopsSchema = z.object({
  from: day,
  to: day,
  alert_days: num,
  workshops: z.array(workshopRowSchema),
  total: z.object({
    returned: num,
    avg_days: nullableNum,
    median_days: nullableNum,
    in_workshop: num,
    over_alert: num,
    cost: nullableNum,
    buckets: z.array(labelValue),
  }),
});
export type DashboardWorkshops = z.infer<typeof workshopsSchema>;

export const sellerRowSchema = z.object({
  id: z.string().nullable(),
  name: z.string(),
  is_self: z.boolean(),
  orders: num,
  sold: num,
  sold_orders: num,
  ticket: num,
  collected: num,
  pieces: num,
  approved: num,
  approval_rate: nullableNum,
  cwa_created: num,
  cwa_converted: num,
});
export type DashboardSellerRow = z.infer<typeof sellerRowSchema>;

export const sellersSchema = z.object({
  from: day,
  to: day,
  scope: z.enum(["todos", "propio"]),
  sellers: z.array(sellerRowSchema),
});
export type DashboardSellers = z.infer<typeof sellersSchema>;

export const quotesSchema = z.object({
  from: day,
  to: day,
  bucket: z.string(),
  cwa: z.object({
    created: num,
    cotizada: num,
    pedida_parcial: num,
    pedida: num,
    descartada: num,
    quoted_amount: num,
    items_quoted: num,
    items_ordered: num,
    ordered_amount: num,
    conversion: nullableNum,
    item_conversion: nullableNum,
  }),
  discard_reasons: z.array(labelValue),
  cot: z.object({
    created: num,
    borrador: num,
    emitida: num,
    aceptada: num,
    rechazada: num,
    vencida: num,
    amount: num,
    accepted_amount: num,
    acceptance: nullableNum,
  }),
  by_origin: z.array(
    z.object({ key: z.string(), orders: num, sold: num, ticket: num }),
  ),
  series: z.array(z.object({ d: day, cotizadas: num, pedidas: num })),
});
export type DashboardQuotes = z.infer<typeof quotesSchema>;
