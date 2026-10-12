import Link from "next/link";

import { KanbanCard, KanbanColumns } from "@/components/kanban-columns";
import { Badge } from "@/components/ui/badge";
import { WhatsAppBadge } from "@/components/whatsapp-badge";
import { formatCents, PAYMENT_STATUS_LABELS } from "@/domain/money";
import {
  RESTORATION_STATUS_LABELS,
  RESTORATION_STATUSES,
  type RestorationStatus,
} from "@/domain/restoration-status";
import { formatDate } from "@/lib/format";
import type { RestorationListItem } from "@/server/restorations/queries";

/**
 * Tablero kanban de restauraciones: una columna por estado general. Logística no
 * ve las columnas de restauraciones pasadas (completadas y anuladas, D24) ni montos;
 * las rechazadas sí, mientras tengan piezas por devolver (P48).
 */
export function RestorationsKanban({
  items,
  showMoney,
}: {
  items: RestorationListItem[];
  showMoney: boolean;
}) {
  const statuses: readonly RestorationStatus[] = showMoney
    ? RESTORATION_STATUSES
    : RESTORATION_STATUSES.filter((s) => s !== "completada" && s !== "anulada");

  return (
    <KanbanColumns
      label="Restauraciones por estado"
      emptyText="Sin restauraciones"
      columns={statuses.map((status) => ({
        key: status,
        label: RESTORATION_STATUS_LABELS[status],
        items: items.filter((r) => r.status === status),
      }))}
      renderCard={(r) => (
        <KanbanCard key={r.id} data-testid={`tarjeta-${r.code}`}>
          <div className="flex items-start justify-between gap-2">
            <Link
              href={`/restauraciones/${r.id}`}
              className="text-heading font-medium underline-offset-4 hover:underline"
            >
              {r.code}
            </Link>
            <span className="text-muted-foreground text-xs">
              {formatDate(r.createdAt)}
            </span>
          </div>
          <p className="truncate">{r.clientName}</p>
          <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
            <span>
              {r.piecesCount} {r.piecesCount === 1 ? "pieza" : "piezas"}
            </span>
            {showMoney && r.totalCents !== null ? (
              <span>{formatCents(r.totalCents)}</span>
            ) : null}
            {r.origin === "whatsapp" ? (
              <WhatsAppBadge>WhatsApp</WhatsAppBadge>
            ) : null}
            {r.paymentStatus ? (
              <Badge variant="outline">
                {PAYMENT_STATUS_LABELS[r.paymentStatus]}
              </Badge>
            ) : null}
          </div>
        </KanbanCard>
      )}
    />
  );
}
