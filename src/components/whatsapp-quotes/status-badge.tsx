import { Badge } from "@/components/ui/badge";
import {
  WHATSAPP_QUOTE_STATUS_LABELS,
  type WhatsappQuoteStatus,
} from "@/domain/whatsapp-quotes";
import { cn } from "@/lib/utils";

const VARIANTS = {
  cotizada: "outline",
  pedida_parcial: "secondary",
  pedida: "default",
  descartada: "outline",
} as const satisfies Record<WhatsappQuoteStatus, string>;

/** Estado de la cotización de WhatsApp; lo descartado va tenue y tachado. */
export function WhatsappQuoteStatusBadge({
  status,
  className,
}: {
  status: WhatsappQuoteStatus;
  className?: string;
}) {
  return (
    <Badge
      variant={VARIANTS[status]}
      data-status={status}
      className={cn(
        status === "descartada" && "text-muted-foreground line-through",
        className,
      )}
    >
      {WHATSAPP_QUOTE_STATUS_LABELS[status]}
    </Badge>
  );
}
