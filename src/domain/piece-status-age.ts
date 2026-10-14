import type { PieceStatus } from "./piece-state-machine";

/**
 * Días en el estado actual con semáforo (C5 de MejorasUI.md): neutro, atención o
 * crítico según cuánto lleva la pieza en su estado. Los umbrales son por estado y se
 * ajustan aquí.
 */

export type AgeTone = "neutral" | "attention" | "critical";

/** [atención, crítico] en días calendario; los estados finales no tienen alerta. */
export const STATUS_AGE_THRESHOLDS: Partial<
  Record<PieceStatus, readonly [number, number]>
> = {
  registrada: [3, 7],
  en_consulta: [3, 7],
  en_espera: [3, 7],
  aprobada: [3, 7],
  enviada_taller: [7, 15],
  observada: [3, 7],
  rechazada: [7, 15],
  sin_arreglo: [7, 15],
};

/** "Lista para entregar" (ya volvió del taller) tiene sus propios umbrales. */
export const READY_AGE_THRESHOLDS = [7, 15] as const;

export function statusAgeTone(
  piece: { status: PieceStatus; readyForDelivery?: boolean },
  days: number,
): AgeTone {
  const limits = piece.readyForDelivery
    ? READY_AGE_THRESHOLDS
    : STATUS_AGE_THRESHOLDS[piece.status];
  if (!limits) return "neutral";
  if (days >= limits[1]) return "critical";
  if (days >= limits[0]) return "attention";
  return "neutral";
}

export const AGE_TONE_LABELS: Record<AgeTone, string> = {
  neutral: "A tiempo",
  attention: "Atención",
  critical: "Demorada",
};

export function statusAgeText(days: number): string {
  return days === 0
    ? "Hoy en este estado"
    : `${days} ${days === 1 ? "día" : "días"} en este estado`;
}
