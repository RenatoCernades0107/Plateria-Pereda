import { utcDate, type Bucket } from "./dashboard-range";
import type {
  DashboardOrders,
  DashboardWorkshopRow,
} from "./dashboard-schemas";
import { PERU_REGIONS } from "./regions";
import type { BadgeTone } from "./status-progress";

/** Transformaciones de los datos de las métricas a lo que dibujan los gráficos y tablas. */

const DAY_FORMAT = new Intl.DateTimeFormat("es-PE", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const MONTH_SHORT = new Intl.DateTimeFormat("es-PE", {
  month: "short",
  timeZone: "UTC",
});
const MONTH_LONG = new Intl.DateTimeFormat("es-PE", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const noDot = (text: string) => text.replace(/\./g, "");

/**
 * Etiqueta de una agrupación: "27 oct" (día o inicio de semana) o "oct" (mes).
 * La larga sirve para el tooltip y la tabla: "Semana del 27 oct", "octubre 2026".
 */
export function bucketLabel(
  date: string,
  bucket: Bucket,
  long = false,
): string {
  const d = utcDate(date);
  switch (bucket) {
    case "dia":
      return noDot(DAY_FORMAT.format(d));
    case "semana":
      return long
        ? `Semana del ${noDot(DAY_FORMAT.format(d))}`
        : noDot(DAY_FORMAT.format(d));
    case "mes":
      return long
        ? MONTH_LONG.format(d).replace(" de ", " ")
        : noDot(MONTH_SHORT.format(d)).toLowerCase();
  }
}

/** Agrega `label` y `longLabel` a cada punto de una serie. */
export function seriesPoints<T extends { d: string }>(
  series: T[],
  bucket: Bucket,
): (T & { label: string; longLabel: string })[] {
  return series.map((point) => ({
    ...point,
    label: bucketLabel(point.d, bucket),
    longLabel: bucketLabel(point.d, bucket, true),
  }));
}

/** Los valores de una columna de la serie, para un sparkline. */
export function sparkValues<T extends { d: string }>(
  series: T[],
  key: keyof T,
): number[] {
  return series.map((point) => Number(point[key]) || 0);
}

export type LabelValue = { label: string; value: number };

/** Los `max` mayores y el resto agrupado en "Otros" (nunca se inventan más colores). */
export function topWithOthers(
  items: LabelValue[],
  max: number,
  othersLabel = "Otros",
): LabelValue[] {
  const sorted = [...items].sort((a, b) => b.value - a.value);
  if (sorted.length <= max) return sorted;
  const head = sorted.slice(0, max - 1);
  const rest = sorted.slice(max - 1).reduce((sum, item) => sum + item.value, 0);
  return [...head, { label: othersLabel, value: rest }];
}

/** Agrega el porcentaje de cada valor sobre el total (0 si el total es 0). */
export function withShare<T extends { value: number }>(
  items: T[],
): (T & { pct: number })[] {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  return items.map((item) => ({
    ...item,
    pct: total > 0 ? (item.value / total) * 100 : 0,
  }));
}

/**
 * Ordena `{ key, value }` según un orden canónico, les pone etiqueta y quita los ceros;
 * lo desconocido va al final con su clave como etiqueta.
 */
export function orderedCounts(
  items: { key: string; value: number }[],
  order: readonly string[],
  labels: Record<string, string>,
): { key: string; label: string; value: number }[] {
  const rank = (key: string) => {
    const index = order.indexOf(key);
    return index === -1 ? order.length : index;
  };
  return items
    .filter((item) => item.value > 0)
    .sort((a, b) => rank(a.key) - rank(b.key))
    .map((item) => ({
      key: item.key,
      label: labels[item.key] ?? item.key,
      value: item.value,
    }));
}

export type FunnelStep = {
  key: string;
  label: string;
  value: number;
  /** Porcentaje sobre las piezas registradas (null si no hubo ninguna). */
  pct: number | null;
};

/** El camino de las piezas registradas en el rango: registradas → aprobadas → entregadas. */
export function funnelSteps(funnel: DashboardOrders["funnel"]): FunnelStep[] {
  const pct = (value: number) =>
    funnel.registered > 0 ? (value / funnel.registered) * 100 : null;
  return [
    {
      key: "registered",
      label: "Registradas",
      value: funnel.registered,
      pct: pct(funnel.registered),
    },
    {
      key: "approved",
      label: "Aprobadas",
      value: funnel.approved,
      pct: pct(funnel.approved),
    },
    {
      key: "delivered",
      label: "Entregadas",
      value: funnel.delivered,
      pct: pct(funnel.delivered),
    },
  ];
}

/** Lo que no avanzó en el camino (para mostrar junto al embudo). */
export function funnelLosses(
  funnel: DashboardOrders["funnel"],
): { key: string; label: string; value: number }[] {
  return [
    {
      key: "in_consultation",
      label: "En consulta o espera",
      value: funnel.in_consultation,
    },
    {
      key: "rejected",
      label: "Rechazadas por el cliente",
      value: funnel.rejected,
    },
    { key: "no_fix", label: "Sin arreglo", value: funnel.no_fix },
    { key: "cancelled", label: "Anuladas", value: funnel.cancelled },
  ];
}

/** Porcentaje de piezas registradas que se aprobaron (null si no hubo ninguna). */
export function approvalRate(funnel: DashboardOrders["funnel"]): number | null {
  return funnel.registered > 0
    ? (funnel.approved / funnel.registered) * 100
    : null;
}

/** Nombre de la región a partir de su código de Shopify ("LIM" → "Lima"). */
export function regionName(code: string): string {
  if (code === "SIN") return "Sin región";
  return PERU_REGIONS.find((region) => region.code === code)?.name ?? code;
}

/**
 * Tono del taller según la pieza que lleva más días: crítico desde 2 veces el umbral de
 * alerta, atención desde el umbral, neutro si hay piezas sin retraso y sin tono si no
 * tiene ninguna (mismos umbrales que `piece-status-age.ts`: 7 y 15 días).
 */
export function workshopTone(
  row: Pick<
    DashboardWorkshopRow,
    "in_workshop" | "over_alert" | "max_now_days"
  >,
  alertDays: number,
): BadgeTone {
  if (row.in_workshop === 0) return "neutral";
  const max = row.max_now_days ?? 0;
  if (max >= alertDays * 2) return "critical";
  if (row.over_alert > 0 || max >= alertDays) return "attention";
  return "success";
}

/** Ancho (0–100) de una barra respecto del mayor valor; nunca menos de 2 si hay valor. */
export function barWidth(value: number, max: number): number {
  if (max <= 0 || value <= 0) return 0;
  return Math.max(2, Math.min(100, (value / max) * 100));
}
