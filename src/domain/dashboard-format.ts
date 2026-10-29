/** Formatos de las tarjetas del dashboard: soles, días, porcentajes y variaciones. */

const wholeSoles = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN",
  maximumFractionDigits: 0,
});
const plainNumber = new Intl.NumberFormat("es-PE", {
  maximumFractionDigits: 1,
});
const oneDecimal = new Intl.NumberFormat("es-PE", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const clean = (text: string) => text.replace(/ /g, " ");

/** "S/ 12,346": soles enteros, para tarjetas y tablas. */
export function formatSolesWhole(amount: number): string {
  return clean(wholeSoles.format(Math.round(amount)));
}

/** "S/ 12.4 mil" / "S/ 1.2 M": versión corta para ejes y tarjetas pequeñas. */
export function formatSolesCompact(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "−" : "";
  if (abs < 1_000) return `${sign}S/ ${plainNumber.format(Math.round(abs))}`;
  if (abs < 1_000_000)
    return `${sign}S/ ${plainNumber.format(abs / 1_000)} mil`;
  return `${sign}S/ ${plainNumber.format(abs / 1_000_000)} M`;
}

/** Números de eje: "0", "500", "1.5 mil". */
export function formatAxisCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs < 1_000) return plainNumber.format(value);
  if (abs < 1_000_000) return `${plainNumber.format(value / 1_000)} mil`;
  return `${plainNumber.format(value / 1_000_000)} M`;
}

/** "1 día", "4.5 días", "—" si no hay dato. */
export function formatDays(days: number | null | undefined): string {
  if (days === null || days === undefined) return "—";
  const text = plainNumber.format(days);
  return `${text} ${days === 1 ? "día" : "días"}`;
}

/** "33.3 %", "—" si no hay dato. */
export function formatPercent(
  value: number | null | undefined,
  digits: 0 | 1 = 1,
): string {
  if (value === null || value === undefined) return "—";
  return `${digits === 0 ? plainNumber.format(Math.round(value)) : oneDecimal.format(value)} %`;
}

export function formatCount(value: number): string {
  return plainNumber.format(value);
}

export type DeltaKind = "up" | "down" | "flat" | "new" | "none";
export type Delta = { kind: DeltaKind; pct: number | null };

/**
 * Variación contra el periodo anterior. Sin base (0 → algo) es "Nuevo", sin datos en
 * ninguno de los dos no hay variación, y menos de 0.05 % se considera igual.
 */
export function computeDelta(
  current: number | null | undefined,
  previous: number | null | undefined,
): Delta {
  if (current === null || current === undefined)
    return { kind: "none", pct: null };
  if (previous === null || previous === undefined)
    return { kind: "none", pct: null };
  if (previous === 0) {
    return current === 0
      ? { kind: "none", pct: null }
      : { kind: "new", pct: null };
  }
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  if (Math.abs(pct) < 0.05) return { kind: "flat", pct: 0 };
  return { kind: pct > 0 ? "up" : "down", pct };
}

/** "+12.5 %", "−8.0 %", "Nuevo", "Igual" o "" si no hay variación. */
export function deltaText(delta: Delta): string {
  switch (delta.kind) {
    case "up":
      return `+${oneDecimal.format(delta.pct ?? 0)} %`;
    case "down":
      return `−${oneDecimal.format(Math.abs(delta.pct ?? 0))} %`;
    case "new":
      return "Nuevo";
    case "flat":
      return "Igual";
    case "none":
      return "";
  }
}

export type DeltaTone = "good" | "bad" | "neutral";

/** Si subir es bueno (ventas) o malo (días de cumplimiento) decide el color. */
export function deltaTone(delta: Delta, upIsGood = true): DeltaTone {
  if (delta.kind === "up" || delta.kind === "new")
    return upIsGood ? "good" : "bad";
  if (delta.kind === "down") return upIsGood ? "bad" : "good";
  return "neutral";
}
