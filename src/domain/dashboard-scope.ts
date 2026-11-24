import { formatRange, type DashboardRange } from "./dashboard-range";

/**
 * Qué tiempo toma cada cifra o gráfico del dashboard. Hay tres casos, según el SQL de
 * las funciones `dashboard_*`:
 *
 * - `periodo`: datos con la fecha de un evento dentro del rango elegido (aprobación,
 *   pago, entrega, alta…). Cambia con el rango.
 * - `hoy`: foto del estado de hoy (saldo por cobrar, piezas en curso o en taller ahora,
 *   pendientes…). No cambia con el rango.
 * - `cohorte`: lo registrado dentro del rango, contado con el estado que tiene hoy
 *   (estado de las guías, camino de las piezas, estado de las cotizaciones…).
 */
export const DASHBOARD_SCOPE_KINDS = ["periodo", "hoy", "cohorte"] as const;
export type DashboardScopeKind = (typeof DASHBOARD_SCOPE_KINDS)[number];

type RangeDates = Pick<DashboardRange, "from" | "to">;

export type DashboardScope =
  | { kind: "periodo"; range: RangeDates; today: string }
  | { kind: "hoy"; today: string }
  | { kind: "cohorte"; range: RangeDates; today: string };

/** Los tres alcances ya ligados al rango elegido y al día de hoy en Lima. */
export type DashboardScopes = {
  [K in DashboardScopeKind]: DashboardScope & { kind: K };
};

export function dashboardScopes(
  range: RangeDates,
  today: string,
): DashboardScopes {
  const dates = { from: range.from, to: range.to };
  return {
    periodo: { kind: "periodo", range: dates, today },
    hoy: { kind: "hoy", today },
    cohorte: { kind: "cohorte", range: dates, today },
  };
}

/** `true` si el rango llega hasta el día de hoy (los atajos «Hoy», «30 días», «Este mes»…). */
export function rangeEndsToday(range: RangeDates, today: string): boolean {
  return range.to === today;
}

export type ScopeText = {
  /** Lo principal: el rango, o «Al día de hoy». */
  label: string;
  /** Matiz corto: «hasta hoy», «estado actual»… */
  detail?: string;
  /** Frase completa para el atributo `title` y los lectores de pantalla. */
  description: string;
};

export const SCOPE_NAMES: Record<DashboardScopeKind, string> = {
  periodo: "Periodo",
  hoy: "Hoy",
  cohorte: "Estado actual",
};

/** Lo que dice la insignia de un alcance. */
export function scopeText(scope: DashboardScope): ScopeText {
  if (scope.kind === "hoy") {
    const date = formatRange({ from: scope.today, to: scope.today });
    return {
      label: "Al día de hoy",
      detail: "no cambia con el periodo",
      description: `Foto de hoy (${date}): no cambia con el periodo elegido.`,
    };
  }
  const label = formatRange(scope.range);
  const single = scope.range.from === scope.range.to;
  const untilToday = rangeEndsToday(scope.range, scope.today);
  if (scope.kind === "periodo") {
    const detail = untilToday ? (single ? "hoy" : "hasta hoy") : undefined;
    return {
      label,
      detail,
      description: `Datos con fecha dentro del periodo ${label}${
        untilToday ? ", hasta hoy" : ""
      }.`,
    };
  }
  return {
    label,
    detail: "estado actual",
    description: `Lo registrado en el periodo ${label}${
      untilToday ? " (hasta hoy)" : ""
    }, con el estado que tiene hoy.`,
  };
}
