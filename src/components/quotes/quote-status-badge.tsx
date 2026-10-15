import { ToneBadge } from "@/components/tone-badge";
import { QUOTE_STATUS_LABELS, type QuoteDisplayStatus } from "@/domain/quote";
import type { BadgeTone } from "@/domain/status-progress";

const TONES = {
  borrador: "neutral",
  emitida: "info",
  aceptada: "success",
  rechazada: "critical",
  vencida: "neutral",
} as const satisfies Record<QuoteDisplayStatus, BadgeTone>;

/** Estado de la cotización, con la misma familia de insignias que el resto. */
export function QuoteStatusBadge({ status }: { status: QuoteDisplayStatus }) {
  return (
    <ToneBadge
      tone={TONES[status]}
      data-testid="estado-cotizacion"
      data-status={status}
    >
      {QUOTE_STATUS_LABELS[status]}
    </ToneBadge>
  );
}
