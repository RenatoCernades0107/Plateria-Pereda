import { Badge } from "@/components/ui/badge";
import { QUOTE_STATUS_LABELS, type QuoteDisplayStatus } from "@/domain/quote";

const VARIANTS = {
  borrador: "outline",
  emitida: "secondary",
  aceptada: "default",
  rechazada: "destructive",
  vencida: "outline",
} as const satisfies Record<QuoteDisplayStatus, string>;

export function QuoteStatusBadge({ status }: { status: QuoteDisplayStatus }) {
  return (
    <Badge variant={VARIANTS[status]} data-testid="estado-cotizacion">
      {QUOTE_STATUS_LABELS[status]}
    </Badge>
  );
}
