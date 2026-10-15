import { CANCELLED_CLASS, ToneBadge } from "@/components/tone-badge";
import type { BadgeTone } from "@/domain/status-progress";
import {
  WHATSAPP_QUOTE_STATUS_LABELS,
  type WhatsappQuoteStatus,
} from "@/domain/whatsapp-quotes";
import { cn } from "@/lib/utils";

const TONES = {
  cotizada: "attention",
  pedida_parcial: "info",
  pedida: "success",
  descartada: "neutral",
} as const satisfies Record<WhatsappQuoteStatus, BadgeTone>;

/** Estado de la cotización de WhatsApp; lo descartado va tenue y tachado. */
export function WhatsappQuoteStatusBadge({
  status,
  className,
}: {
  status: WhatsappQuoteStatus;
  className?: string;
}) {
  return (
    <ToneBadge
      tone={TONES[status]}
      data-status={status}
      className={cn(status === "descartada" && CANCELLED_CLASS, className)}
    >
      {WHATSAPP_QUOTE_STATUS_LABELS[status]}
    </ToneBadge>
  );
}
