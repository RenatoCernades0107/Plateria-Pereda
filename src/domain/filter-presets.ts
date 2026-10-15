import {
  pieceBoardHref,
  WORKSHOP_DAYS_ALERT,
  type PieceBoardFilters,
} from "./piece-board-filters";
import {
  restorationFiltersHref,
  type RestorationFilters,
} from "./restoration-filters";

/**
 * Filtros predefinidos de un clic (K12 de MejorasUI.md): chips arriba de `/piezas`
 * y `/restauraciones`. Cada chip es un enlace con el filtro en la URL; si ya está
 * activo, el clic lo quita. Se combinan con los demás filtros y muestran cuántos
 * resultados darían (la carga de trabajo, sin tener que hacer clic).
 */

/** `alert`: lo que pide atención (urgente, demorado) va en un rojo tenue. */
export type ChipTone =
  | "default"
  | "alert"
  | "info"
  | "success"
  | "attention"
  | "whatsapp";

export type FilterChip = {
  key: string;
  label: string;
  active: boolean;
  href: string;
  tone: ChipTone;
  /** Borde punteado: "a medias" (parcialmente aprobada). */
  dashed?: boolean;
  /** Resultados con este chip activo (y los demás filtros); sin dato, no se muestra. */
  count?: number;
};

type Preset<F> = {
  key: string;
  label: string;
  tone?: ChipTone;
  dashed?: boolean;
  on: Partial<F>;
  off: Partial<F>;
  isActive: (filters: F) => boolean;
};

export const PIECE_PRESETS: readonly Preset<PieceBoardFilters>[] = [
  {
    key: "urgentes",
    label: "Urgentes",
    tone: "alert",
    on: { urgent: true },
    off: { urgent: false },
    isActive: (f) => f.urgent,
  },
  {
    key: "listas",
    tone: "success",
    label: "Listas para entregar",
    on: { ready: true },
    off: { ready: false },
    isActive: (f) => f.ready,
  },
  {
    key: "devolver",
    tone: "info",
    label: "Por devolver",
    on: { toReturn: true },
    off: { toReturn: false },
    isActive: (f) => f.toReturn,
  },
  {
    key: "taller",
    label: `En taller ${WORKSHOP_DAYS_ALERT}+ días`,
    tone: "alert",
    on: { minDays: WORKSHOP_DAYS_ALERT },
    off: { minDays: null },
    isActive: (f) => f.minDays === WORKSHOP_DAYS_ALERT,
  },
];

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((v) => b.includes(v));

export const RESTORATION_PRESETS: readonly Preset<RestorationFilters>[] = [
  {
    key: "pago-pendiente",
    tone: "attention",
    label: "Pago pendiente",
    on: { paymentStatus: ["pendiente"] },
    off: { paymentStatus: [] },
    isActive: (f) => sameSet(f.paymentStatus, ["pendiente"]),
  },
  {
    key: "pago-parcial",
    tone: "info",
    label: "Pago parcial",
    on: { paymentStatus: ["parcial"] },
    off: { paymentStatus: [] },
    isActive: (f) => sameSet(f.paymentStatus, ["parcial"]),
  },
  {
    key: "parcialmente-aprobadas",
    tone: "info",
    dashed: true,
    label: "Parcialmente aprobadas",
    on: { status: ["parcialmente_aprobada"] },
    off: { status: [] },
    isActive: (f) => sameSet(f.status, ["parcialmente_aprobada"]),
  },
  {
    key: "listas",
    tone: "success",
    label: "Listas para entregar",
    on: { status: ["parcialmente_lista", "lista"] },
    off: { status: [] },
    isActive: (f) => sameSet(f.status, ["parcialmente_lista", "lista"]),
  },
  {
    key: "whatsapp",
    tone: "whatsapp",
    label: "De WhatsApp",
    on: { origin: ["whatsapp"] },
    off: { origin: [] },
    isActive: (f) => sameSet(f.origin, ["whatsapp"]),
  },
];

export type ChipCounts = Partial<Record<string, number>>;

function chips<F extends { page: number }>(
  presets: readonly Preset<F>[],
  filters: F,
  href: (filters: F, changes: Partial<F>) => string,
  counts: ChipCounts = {},
): FilterChip[] {
  return presets.map((p) => {
    const active = p.isActive(filters);
    return {
      key: p.key,
      label: p.label,
      active,
      tone: p.tone ?? "default",
      dashed: p.dashed,
      count: counts[p.key],
      href: href(filters, {
        ...(active ? p.off : p.on),
        page: 1,
      } as Partial<F>),
    };
  });
}

/**
 * Los filtros con que se cuenta cada chip: los actuales con el chip encendido (lo que
 * se vería al hacer clic). Uno activo da el total de la lista actual.
 */
function countFilters<F extends { page: number }>(
  presets: readonly Preset<F>[],
  filters: F,
): { key: string; active: boolean; filters: F }[] {
  return presets.map((p) => ({
    key: p.key,
    active: p.isActive(filters),
    filters: { ...filters, ...p.on, page: 1 },
  }));
}

export const pieceFilterChips = (
  filters: PieceBoardFilters,
  counts?: ChipCounts,
) => chips(PIECE_PRESETS, filters, pieceBoardHref, counts);

export const pieceChipCountFilters = (filters: PieceBoardFilters) =>
  countFilters(PIECE_PRESETS, filters);

/** `showMoney`: los chips de pago solo para quien ve los montos. */
const restorationPresets = (showMoney: boolean) =>
  showMoney
    ? RESTORATION_PRESETS
    : RESTORATION_PRESETS.filter((p) => !p.key.startsWith("pago"));

export const restorationFilterChips = (
  filters: RestorationFilters,
  { showMoney, counts }: { showMoney: boolean; counts?: ChipCounts },
) =>
  chips(restorationPresets(showMoney), filters, restorationFiltersHref, counts);

export const restorationChipCountFilters = (
  filters: RestorationFilters,
  { showMoney }: { showMoney: boolean },
) => countFilters(restorationPresets(showMoney), filters);
