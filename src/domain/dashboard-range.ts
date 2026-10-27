import { addDays, limaDateOf } from "./quote";

/**
 * Rango de fechas y pestaña del dashboard, leídos de la URL
 * (`/dashboard?area=ventas&rango=30d` o `?rango=custom&desde=…&hasta=…`).
 * Las fechas son "AAAA-MM-DD" de Lima, inclusivas, igual que las funciones `dashboard_*`.
 */

export const DASHBOARD_AREAS = [
  "resumen",
  "ventas",
  "pedidos",
  "clientes",
  "talleres",
  "vendedores",
  "cotizaciones",
] as const;
export type DashboardArea = (typeof DASHBOARD_AREAS)[number];

export const DASHBOARD_AREA_LABELS: Record<DashboardArea, string> = {
  resumen: "Resumen",
  ventas: "Ventas",
  pedidos: "Pedidos",
  clientes: "Clientes",
  talleres: "Talleres",
  vendedores: "Vendedores",
  cotizaciones: "Cotizaciones",
};

export const RANGE_PRESETS = [
  "hoy",
  "7d",
  "30d",
  "mes",
  "mes-pasado",
  "90d",
  "anio",
] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

export const RANGE_PRESET_LABELS: Record<RangePreset, string> = {
  hoy: "Hoy",
  "7d": "7 días",
  "30d": "30 días",
  mes: "Este mes",
  "mes-pasado": "Mes pasado",
  "90d": "90 días",
  anio: "Este año",
};

export const DEFAULT_PRESET: RangePreset = "30d";
/** Tope de días de un rango (las funciones de la BD aceptan hasta 800). */
export const MAX_RANGE_DAYS = 366;

export type DashboardRange = {
  from: string;
  to: string;
  /** `custom` cuando las fechas las eligió el usuario. */
  preset: RangePreset | "custom";
};

export type DashboardParams = { area: DashboardArea; range: DashboardRange };

export type Bucket = "dia" | "semana" | "mes";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Año, mes (1–12) y día de una fecha "AAAA-MM-DD" ya validada. */
export function ymd(date: string): [number, number, number] {
  const [y = 0, m = 1, d = 1] = date.split("-").map(Number);
  return [y, m, d];
}

/** Fecha UTC (medianoche) de un "AAAA-MM-DD", sin que le afecte la zona horaria. */
export function utcDate(date: string): Date {
  const [y, m, d] = ymd(date);
  return new Date(Date.UTC(y, m - 1, d));
}

/** `true` si la cadena es una fecha calendario real "AAAA-MM-DD". */
export function isIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  return (
    date.getUTCFullYear() === Number(y) &&
    date.getUTCMonth() === Number(m) - 1 &&
    date.getUTCDate() === Number(d)
  );
}

/** Días calendario entre dos fechas "AAAA-MM-DD" (to − from). */
export function dayDiff(from: string, to: string): number {
  if (!ISO_DATE.test(from) || !ISO_DATE.test(to)) {
    throw new Error(`Fecha inválida: ${from} / ${to}`);
  }
  return Math.round((utcDate(to).getTime() - utcDate(from).getTime()) / 86_400_000);
}

/** Cantidad de días del rango, contando ambos extremos. */
export function rangeDays(range: Pick<DashboardRange, "from" | "to">): number {
  return dayDiff(range.from, range.to) + 1;
}

function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

/** Último día del mes de una fecha "AAAA-MM-DD". */
function monthEnd(date: string): string {
  const [y, m] = ymd(date);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${date.slice(0, 7)}-${String(last).padStart(2, "0")}`;
}

/** Las fechas de un atajo, según el día de hoy en Lima. */
export function presetRange(preset: RangePreset, today: string): DashboardRange {
  switch (preset) {
    case "hoy":
      return { from: today, to: today, preset };
    case "7d":
      return { from: addDays(today, -6), to: today, preset };
    case "30d":
      return { from: addDays(today, -29), to: today, preset };
    case "90d":
      return { from: addDays(today, -89), to: today, preset };
    case "mes":
      return { from: monthStart(today), to: today, preset };
    case "mes-pasado": {
      const lastOfPrevious = addDays(monthStart(today), -1);
      return {
        from: monthStart(lastOfPrevious),
        to: monthEnd(lastOfPrevious),
        preset,
      };
    }
    case "anio":
      return { from: `${today.slice(0, 4)}-01-01`, to: today, preset };
  }
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function isPreset(value: string | undefined): value is RangePreset {
  return (RANGE_PRESETS as readonly string[]).includes(value ?? "");
}

function isArea(value: string | undefined): value is DashboardArea {
  return (DASHBOARD_AREAS as readonly string[]).includes(value ?? "");
}

/**
 * Pestaña y rango a partir de los parámetros de la URL. Lo inválido vuelve al valor por
 * defecto (30 días), las fechas invertidas se ordenan y un rango demasiado largo se
 * recorta a sus últimos 366 días.
 */
export function parseDashboardParams(
  searchParams: Record<string, string | string[] | undefined>,
  today: string = limaDateOf(new Date()),
): DashboardParams {
  const areaParam = first(searchParams.area);
  const area = isArea(areaParam) ? areaParam : "resumen";
  const presetParam = first(searchParams.rango);
  const desde = first(searchParams.desde);
  const hasta = first(searchParams.hasta);

  if (
    (presetParam === "custom" || (!presetParam && (desde || hasta))) &&
    desde &&
    hasta &&
    isIsoDate(desde) &&
    isIsoDate(hasta)
  ) {
    let from = desde <= hasta ? desde : hasta;
    const to = desde <= hasta ? hasta : desde;
    if (dayDiff(from, to) + 1 > MAX_RANGE_DAYS) {
      from = addDays(to, -(MAX_RANGE_DAYS - 1));
    }
    return { area, range: { from, to, preset: "custom" } };
  }

  const preset = isPreset(presetParam) ? presetParam : DEFAULT_PRESET;
  return { area, range: presetRange(preset, today) };
}

/** El periodo inmediatamente anterior, de la misma duración (para los deltas). */
export function previousRange(range: DashboardRange): DashboardRange {
  const days = rangeDays(range);
  return {
    from: addDays(range.from, -days),
    to: addDays(range.from, -1),
    preset: "custom",
  };
}

/** Agrupación de las series según el largo del rango: día, semana o mes. */
export function bucketFor(range: Pick<DashboardRange, "from" | "to">): Bucket {
  const days = rangeDays(range);
  if (days <= 62) return "dia";
  if (days <= 200) return "semana";
  return "mes";
}

export const BUCKET_LABELS: Record<Bucket, string> = {
  dia: "por día",
  semana: "por semana",
  mes: "por mes",
};

/** Enlace al dashboard con la pestaña y el rango dados. */
export function dashboardHref({
  area,
  range,
}: {
  area?: DashboardArea;
  range?: DashboardRange;
}): string {
  const params = new URLSearchParams();
  if (area && area !== "resumen") params.set("area", area);
  if (range) {
    if (range.preset === "custom") {
      params.set("rango", "custom");
      params.set("desde", range.from);
      params.set("hasta", range.to);
    } else if (range.preset !== DEFAULT_PRESET) {
      params.set("rango", range.preset);
    }
  }
  const query = params.toString();
  return query ? `/dashboard?${query}` : "/dashboard";
}

const SHORT = new Intl.DateTimeFormat("es-PE", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const SHORT_YEAR = new Intl.DateTimeFormat("es-PE", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** "1 oct – 27 oct 2026" (o "27 oct 2026" si es un solo día). */
export function formatRange(range: Pick<DashboardRange, "from" | "to">): string {
  const clean = (text: string) => text.replace(/\./g, "");
  if (range.from === range.to) return clean(SHORT_YEAR.format(utcDate(range.to)));
  const sameYear = range.from.slice(0, 4) === range.to.slice(0, 4);
  const start = sameYear ? SHORT.format(utcDate(range.from)) : SHORT_YEAR.format(utcDate(range.from));
  return clean(`${start} – ${SHORT_YEAR.format(utcDate(range.to))}`);
}
