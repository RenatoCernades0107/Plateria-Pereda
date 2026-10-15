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
 * activo, el clic lo quita. Se combinan con los demás filtros.
 */

/** Tono del chip: el mismo que la insignia del estado que filtra. */
export type FilterChipTone =
  | "neutral"
  | "info"
  | "success"
  | "attention"
  | "urgent"
  | "whatsapp";

export type FilterChip = {
  key: string;
  label: string;
  tone: FilterChipTone;
  /** Borde punteado: "a medias" (parcialmente aprobada). */
  dashed?: boolean;
  active: boolean;
  href: string;
};

type Preset<F> = {
  key: string;
  label: string;
  tone: FilterChipTone;
  dashed?: boolean;
  on: Partial<F>;
  off: Partial<F>;
  isActive: (filters: F) => boolean;
};

export const PIECE_PRESETS: readonly Preset<PieceBoardFilters>[] = [
  {
    key: "urgentes",
    tone: "urgent",
    label: "Urgentes",
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
    tone: "attention",
    label: `En taller ${WORKSHOP_DAYS_ALERT}+ días`,
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

function chips<F extends { page: number }>(
  presets: readonly Preset<F>[],
  filters: F,
  href: (filters: F, changes: Partial<F>) => string,
): FilterChip[] {
  return presets.map((p) => {
    const active = p.isActive(filters);
    return {
      key: p.key,
      label: p.label,
      tone: p.tone,
      dashed: p.dashed,
      active,
      href: href(filters, {
        ...(active ? p.off : p.on),
        page: 1,
      } as Partial<F>),
    };
  });
}

export const pieceFilterChips = (filters: PieceBoardFilters) =>
  chips(PIECE_PRESETS, filters, pieceBoardHref);

/** `showMoney`: los chips de pago solo para quien ve los montos. */
export const restorationFilterChips = (
  filters: RestorationFilters,
  { showMoney }: { showMoney: boolean },
) =>
  chips(
    showMoney
      ? RESTORATION_PRESETS
      : RESTORATION_PRESETS.filter((p) => !p.key.startsWith("pago")),
    filters,
    restorationFiltersHref,
  );
