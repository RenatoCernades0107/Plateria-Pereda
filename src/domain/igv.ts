import { percentOf, sumCents, type Cents } from "./money";

/**
 * IGV (P13, D54). Cada restauración y cada cotización indican si sus precios
 * incluyen IGV. Si no lo incluyen, cada pieza o línea se cobra a su precio + 18 %
 * redondeado a céntimos (así la suma coincide con las líneas de la orden de
 * Shopify); si lo incluyen, el desglose solo se informa. La BD aplica la misma
 * regla (`private.price_with_igv`).
 */

/** Tasa del IGV en %. */
export const IGV_PERCENT = 18;

/** Etiquetas de la pregunta "¿El precio incluye IGV?". */
export const IGV_CHOICE_LABELS = {
  si: "Sí, el precio incluye IGV",
  no: `No, se suma el IGV (${IGV_PERCENT} %)`,
} as const;

/** Texto corto para el detalle y los listados. */
export function igvLabel(pricesIncludeIgv: boolean): string {
  return pricesIncludeIgv ? "Incluye IGV" : `+ IGV (${IGV_PERCENT} %)`;
}

/** Precio que se cobra: el mismo si incluye IGV; si no, + 18 % redondeado. */
export function priceWithIgv(price: Cents, pricesIncludeIgv: boolean): Cents {
  return pricesIncludeIgv ? price : price + percentOf(price, IGV_PERCENT);
}

/** Desglose de un total con IGV incluido: base = total / 1.18 redondeada; IGV = el resto. */
export function igvBreakdown(total: Cents): { taxableBase: Cents; igv: Cents } {
  const taxableBase = Math.round((total * 100) / (100 + IGV_PERCENT));
  return { taxableBase, igv: total - taxableBase };
}

export type IgvTotals = {
  /** Lo que paga el cliente (con IGV). */
  total: Cents;
  /** Operación gravada (sin IGV). */
  taxableBase: Cents;
  igv: Cents;
};

/** Total que se cobra y su desglose, a partir de los precios escritos. */
export function igvTotals(
  prices: readonly Cents[],
  pricesIncludeIgv: boolean,
): IgvTotals {
  if (pricesIncludeIgv) {
    const total = sumCents(prices);
    return { total, ...igvBreakdown(total) };
  }
  const taxableBase = sumCents(prices);
  const total = sumCents(prices.map((p) => priceWithIgv(p, false)));
  return { total, taxableBase, igv: total - taxableBase };
}
