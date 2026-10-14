import type { PaymentStatus } from "./money";
import type { RestorationStatus } from "./restoration-status";

/**
 * Tono y progreso de las insignias (S5 de MejorasUI.md, Badge de Polaris): el
 * progreso (○ incompleto, ◐ parcial, ● completo) se ve con un icono, así el avance
 * no depende solo del color.
 */

export type BadgeProgress = "incomplete" | "partial" | "complete";
export type BadgeTone =
  "neutral" | "info" | "success" | "attention" | "critical";

export const PROGRESS_LABELS: Record<BadgeProgress, string> = {
  incomplete: "Sin avance",
  partial: "Avance parcial",
  complete: "Completo",
};

export const PAYMENT_STATUS_BADGE: Record<
  PaymentStatus,
  { tone: BadgeTone; progress: BadgeProgress | null }
> = {
  pendiente: { tone: "attention", progress: "incomplete" },
  parcial: { tone: "info", progress: "partial" },
  pagado: { tone: "success", progress: "complete" },
  reembolsado: { tone: "neutral", progress: null },
};

/** Avance del estado general: solo los estados que son parte de un camino. */
export const RESTORATION_STATUS_PROGRESS: Record<
  RestorationStatus,
  BadgeProgress | null
> = {
  registrada: "incomplete",
  parcialmente_aprobada: "partial",
  aprobada: "complete",
  parcialmente_lista: "partial",
  lista: "complete",
  completada: "complete",
  anulada: null,
  rechazada: null,
};
