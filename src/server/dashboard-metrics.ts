import "server-only";

import type { z } from "zod";

import {
  bucketFor,
  previousRange,
  type Bucket,
  type DashboardRange,
} from "@/domain/dashboard-range";
import {
  clientsSchema,
  ordersSchema,
  quotesSchema,
  salesSchema,
  sellersSchema,
  summarySchema,
  workshopsSchema,
  type DashboardClients,
  type DashboardOrders,
  type DashboardQuotes,
  type DashboardSales,
  type DashboardSellers,
  type DashboardSummary,
  type DashboardWorkshops,
} from "@/domain/dashboard-schemas";
import { WORKSHOP_DAYS_ALERT } from "@/domain/piece-board-filters";
import { createClient } from "@/lib/supabase/server";

/**
 * Métricas del dashboard (Fase 13): una función por pestaña. Cada una llama a su
 * `dashboard_*` de la BD (que decide qué ve cada rol: costos y otros vendedores solo el
 * admin) y valida la respuesta antes de dibujarla.
 */

type MetricName =
  | "dashboard_summary"
  | "dashboard_sales"
  | "dashboard_orders"
  | "dashboard_clients"
  | "dashboard_workshops"
  | "dashboard_sellers"
  | "dashboard_quotes";

async function call<S extends z.ZodType>(
  name: MetricName,
  schema: S,
  args: Record<string, string | number>,
): Promise<z.infer<S>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(name, args as never);
  if (error) throw error;
  return schema.parse(data);
}

const dates = (range: Pick<DashboardRange, "from" | "to">) => ({
  p_from: range.from,
  p_to: range.to,
});

export async function dashboardSummary(
  range: DashboardRange,
  bucket: Bucket = bucketFor(range),
): Promise<DashboardSummary> {
  return call("dashboard_summary", summarySchema, {
    ...dates(range),
    p_bucket: bucket,
  });
}

/** El resumen del periodo y el del periodo anterior de la misma duración (para los deltas). */
export async function dashboardSummaryWithPrevious(
  range: DashboardRange,
): Promise<{ current: DashboardSummary; previous: DashboardSummary }> {
  const bucket = bucketFor(range);
  const [current, previous] = await Promise.all([
    dashboardSummary(range, bucket),
    dashboardSummary(previousRange(range), bucket),
  ]);
  return { current, previous };
}

export async function dashboardSales(
  range: DashboardRange,
): Promise<DashboardSales> {
  return call("dashboard_sales", salesSchema, {
    ...dates(range),
    p_bucket: bucketFor(range),
  });
}

export async function dashboardOrders(
  range: DashboardRange,
): Promise<DashboardOrders> {
  return call("dashboard_orders", ordersSchema, {
    ...dates(range),
    p_bucket: bucketFor(range),
  });
}

export async function dashboardClients(
  range: DashboardRange,
): Promise<DashboardClients> {
  return call("dashboard_clients", clientsSchema, {
    ...dates(range),
    p_bucket: bucketFor(range),
  });
}

export async function dashboardWorkshops(
  range: DashboardRange,
): Promise<DashboardWorkshops> {
  return call("dashboard_workshops", workshopsSchema, {
    ...dates(range),
    p_alert_days: WORKSHOP_DAYS_ALERT,
  });
}

export async function dashboardSellers(
  range: DashboardRange,
): Promise<DashboardSellers> {
  return call("dashboard_sellers", sellersSchema, dates(range));
}

export async function dashboardQuotes(
  range: DashboardRange,
): Promise<DashboardQuotes> {
  return call("dashboard_quotes", quotesSchema, {
    ...dates(range),
    p_bucket: bucketFor(range),
  });
}
